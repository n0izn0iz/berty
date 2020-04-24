/*
 *
 * Copyright 2015 gRPC authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

// Package main implements a client for Greeter service.
package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"strings"
	"time"

	"berty.tech/berty/v2/go/internal/config"
	"berty.tech/berty/v2/go/internal/grpcutil"
	"berty.tech/berty/v2/go/internal/ipfsutil"
	"berty.tech/berty/v2/go/pkg/bertydemo"
	"berty.tech/berty/v2/go/pkg/errcode"
	ma "github.com/multiformats/go-multiaddr"
	"github.com/oklog/run"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

const (
	address1        = "127.0.0.1:1337"
	address2        = "127.0.0.1:1338"
	replicationTime = time.Second * 120
	data            = "hello"
)

func main() {
	/*{
		err := newService("1337")
		if err != nil {
			log.Fatalf("failed to create service: %v", err)
		}
		log.Printf("started service")
	}

	{
		err := newService("1338")
		if err != nil {
			log.Fatalf("failed to create service: %v", err)
		}
		log.Printf("started service")
	}*/

	// Set up a connection to the servers.
	conn1, c1 := newClient(address1)
	defer conn1.Close()

	conn2, c2 := newClient(address2)
	defer conn2.Close()

	// Get a token
	var token string
	{
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		r, err := c1.LogToken(ctx, &bertydemo.LogToken_Request{})
		if err != nil {
			log.Fatalf("could not get token: %v", err)
		}
		token = r.GetLogToken()
		log.Printf("token: %s\n", token)
	}

	// List log in second service
	{
		log.Printf("listing data in c2\n")
		c := make(chan string)

		go func() {
			for {
				r, err := c2.LogList(context.Background(), &bertydemo.LogList_Request{LogToken: token, Options: nil})
				if err != nil {
					log.Fatalf("could not list data: %v", err)
				}
				ops := r.GetOperations()
				if len(ops) > 0 {
					c <- string(ops[0].Value)
				}
				time.Sleep(time.Second)
			}
		}()

		// Append to log in first service
		{
			log.Printf("adding data in c1\n")
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			_, err := c1.LogAdd(ctx, &bertydemo.LogAdd_Request{LogToken: token, Data: []byte("hello1")})
			if err != nil {
				log.Fatalf("could not add data: %v", err)
			}
			log.Printf("added data in c1\n")
		}

		select {
		case s := <-c:
			log.Printf("got data: %s\n", s)
		case <-time.After(replicationTime):
			log.Fatalf("timed out: no operations found")
		}
	}
}

// DNS Resolve timeout
const ResolveTimeout = time.Second * 10

// Default ipfs bootstrap & rendezvous point server
var DevRendezVousPoint = config.BertyDev.RendezVousPeer
var DefaultBootstrap = config.BertyDev.Bootstrap

func newService(port string) error {
	ctx := context.Background()

	// demo
	var demo *bertydemo.Service
	{
		var err error

		resoveCtx, cancel := context.WithTimeout(ctx, ResolveTimeout)
		defer cancel()

		rdvpeer, err := ipfsutil.ParseAndResolveIpfsAddr(resoveCtx, DevRendezVousPoint)
		if err != nil {
			return errcode.TODO.Wrap(err)
		}

		routingOpts, crouting := ipfsutil.NewTinderRouting(zap.NewNop(), rdvpeer, false)
		buildCfg := ipfsutil.CoreAPIConfig{
			BootstrapAddrs: append(DefaultBootstrap, DevRendezVousPoint),
			Routing:        routingOpts,
		}

		api, node, err := ipfsutil.NewCoreAPI(ctx, &buildCfg)
		if err != nil {
			return errcode.TODO.Wrap(err)
		}
		defer node.Close()

		routing := <-crouting
		defer routing.IpfsDHT.Close()

		demo, err = bertydemo.New(&bertydemo.Opts{
			CoreAPI:          api,
			OrbitDBDirectory: ":memory:",
		})
		if err != nil {
			return err
		}

		defer demo.Close()
	}

	// listeners for berty
	var workers run.Group
	{
		// setup grpc server
		grpcServer := grpc.NewServer()
		bertydemo.RegisterDemoServiceServer(grpcServer, demo)
		// setup listeners
		addrs := strings.Split("/ip4/127.0.0.1/tcp/"+port+"/grpc", ",")
		for _, addr := range addrs {
			maddr, err := parseAddr(addr)
			if err != nil {
				return errcode.TODO.Wrap(err)
			}

			l, err := grpcutil.Listen(maddr)
			if err != nil {
				return errcode.TODO.Wrap(err)
			}

			server := grpcutil.Server{Server: grpcServer}

			workers.Add(func() error {
				//logger.Info("serving", zap.String("maddr", maddr.String()))
				return server.Serve(l)
			}, func(error) {
				l.Close()
			})
		}
	}

	go func() {
		err := workers.Run()
		if err != nil {
			log.Fatalf("workers failed: %v", err)
		}
	}()

	return nil
}

func newClient(address string) (*grpc.ClientConn, bertydemo.DemoServiceClient) {
	conn, err := grpc.Dial(address, grpc.WithInsecure())
	if err != nil {
		log.Fatalf("did not connect: %v", err)
	}
	c := bertydemo.NewDemoServiceClient(conn)
	if err != nil {
		log.Fatalf("could not get token: %v", err)
	}
	return conn, c
}

func parseAddr(addr string) (maddr ma.Multiaddr, err error) {
	maddr, err = ma.NewMultiaddr(addr)
	if err != nil {
		// try to get a tcp multiaddr from host:port
		host, port, serr := net.SplitHostPort(addr)
		if serr != nil {
			return
		}

		if host == "" {
			host = "127.0.0.1"
		}

		addr = fmt.Sprintf("/ip4/%s/tcp/%s/", host, port)
		maddr, err = ma.NewMultiaddr(addr)
	}

	return
}
