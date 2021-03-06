package orbitutil_test

import (
	"context"
	"crypto/rand"
	"fmt"
	"os"
	"testing"

	orbitdb "berty.tech/go-orbit-db"
	"github.com/libp2p/go-libp2p-core/crypto"

	"berty.tech/berty/go/internal/cryptoutil"
	"berty.tech/berty/go/internal/ipfsutil"
	"berty.tech/berty/go/internal/orbitutil"
	"berty.tech/berty/go/pkg/bertyprotocol"
)

func TestAdd(t *testing.T) {
	amount := 20 // speeding up tests, 2000 takes ~25 seconds

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ipfs := ipfsutil.TestingCoreAPI(ctx, t)
	defer ipfs.Close()

	dir := "./orbitdb/benchmarks"
	defer os.RemoveAll(dir)

	orbit, err := orbitdb.NewOrbitDB(ctx, ipfs, &orbitdb.NewOrbitDBOptions{Directory: &dir})
	if err != nil {
		t.Fatal(err)
	}
	defer orbit.Close()

	if err := orbit.RegisterAccessControllerType(orbitutil.NewSimpleAccessController); err != nil {
		t.Fatal(err)
	}

	sigk, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}

	ks := &orbitutil.BertySignedKeyStore{}
	err = ks.SetKey(sigk)
	if err != nil {
		t.Fatal(err)
	}

	sigkB, err := cryptoutil.SeedFromEd25519PrivateKey(sigk)
	if err != nil {
		t.Fatal(err)
	}

	pubkB, err := sigk.GetPublic().Raw()
	if err != nil {
		t.Fatal(err)
	}

	g := &bertyprotocol.Group{PublicKey: pubkB, Secret: sigkB}
	opts, err := orbitutil.DefaultOptions(g, &orbitdb.CreateDBOptions{}, ks, "log")
	if err != nil {
		t.Fatal(err)
	}
	db, err := orbit.Log(ctx, "DemoLog", opts)
	if err != nil {
		t.Fatal(err)
	}

	defer db.Drop()
	defer db.Close()

	for n := 0; n < amount; n++ {
		if _, err := db.Add(ctx, []byte(fmt.Sprintf("%d", n))); err != nil {
			t.Fatal(err)
		}
	}
}
