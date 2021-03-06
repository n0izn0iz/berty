package bertycrypto_test

import (
	"context"
	"encoding/hex"
	"fmt"
	"os"
	"path"
	"testing"
	"time"

	"github.com/ipfs/go-cid"
	keystore "github.com/ipfs/go-ipfs-keystore"
	"github.com/libp2p/go-libp2p-core/crypto"
	"github.com/stretchr/testify/assert"

	"berty.tech/berty/go/internal/account"
	"berty.tech/berty/go/internal/bertycrypto"
	"berty.tech/berty/go/internal/orbitutil"
	"berty.tech/berty/go/internal/testutil"
	"berty.tech/berty/go/pkg/bertyprotocol"
)

func addDummyMemberInMetadataStore(ctx context.Context, t testing.TB, ms orbitutil.MetadataStore, g *bertyprotocol.Group, memberPK crypto.PubKey, join bool) (crypto.PubKey, *bertyprotocol.DeviceSecret) {
	t.Helper()

	acc := account.New(keystore.NewMemKeystore())
	md, err := acc.MemberDeviceForGroup(g)
	assert.NoError(t, err)

	ds, err := account.NewDeviceSecret()
	assert.NoError(t, err)

	if join {
		_, err = orbitutil.MetadataStoreAddDeviceToGroup(ctx, ms, g, md)
		assert.NoError(t, err)
	}

	_, err = orbitutil.MetadataStoreSendSecret(ctx, ms, g, md, memberPK, ds)
	assert.NoError(t, err)

	return md.Device.GetPublic(), ds
}

func mustDeviceSecret(t testing.TB) func(ds *bertyprotocol.DeviceSecret, err error) *bertyprotocol.DeviceSecret {
	return func(ds *bertyprotocol.DeviceSecret, err error) *bertyprotocol.DeviceSecret {
		t.Helper()

		if err != nil {
			t.Fatal(err)
		}

		return ds
	}
}

func mustMessageHeaders(t testing.TB, pk crypto.PubKey, counter uint64) *bertyprotocol.MessageHeaders {
	t.Helper()

	pkB, err := pk.Raw()
	if err != nil {
		t.Fatal(err)
	}

	return &bertyprotocol.MessageHeaders{
		Counter:  counter,
		DevicePK: pkB,
		Sig:      nil,
	}
}

func Test_EncryptMessagePayload(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	g, gSK, err := bertyprotocol.NewGroupMultiMember()
	assert.NoError(t, err)

	_ = gSK

	acc1 := account.New(keystore.NewMemKeystore())

	omd1, err := acc1.MemberDeviceForGroup(g)
	assert.NoError(t, err)

	ds1, err := account.NewDeviceSecret()
	assert.NoError(t, err)

	ds2, err := account.NewDeviceSecret()
	assert.NoError(t, err)

	initialCounter := ds1.Counter
	firstSK := append([]byte(nil), ds1.ChainKey...)

	acc2 := account.New(keystore.NewMemKeystore())

	omd2, err := acc2.MemberDeviceForGroup(g)

	mkh1 := bertycrypto.NewInMemoryMessageKeys()
	mkh2 := bertycrypto.NewInMemoryMessageKeys()

	gc1 := orbitutil.NewContextGroup(g, nil, nil, mkh1, omd1)
	gc2 := orbitutil.NewContextGroup(g, nil, nil, mkh2, omd2)

	err = bertycrypto.RegisterChainKey(ctx, mkh1, g, gc1.DevicePubKey(), ds1, true)
	assert.NoError(t, err)

	err = bertycrypto.RegisterChainKey(ctx, mkh2, g, gc2.DevicePubKey(), ds2, true)
	assert.NoError(t, err)

	payloadRef1 := []byte("ok, this is the first test")
	payloadRef2 := []byte("so, this is a second test")
	payloadRef3 := []byte("this will be posted many times")

	err = bertycrypto.RegisterChainKey(ctx, mkh2, g, omd1.Device.GetPublic(), ds1, false)
	assert.NoError(t, err)

	assert.Equal(t, mustDeviceSecret(t)(mkh1.GetDeviceChainKey(ctx, omd1.Device.GetPublic())).ChainKey, firstSK)

	payloadEnc1, _, err := bertycrypto.SealPayload(payloadRef1, mustDeviceSecret(t)(mkh1.GetDeviceChainKey(ctx, omd1.Device.GetPublic())), omd1.Device, g)
	assert.NoError(t, err)

	// Secret is derived by SealEnvelope
	err = bertycrypto.DeriveDeviceSecret(ctx, mkh1, g, omd1.Device)
	assert.NoError(t, err)

	assert.NotEqual(t, hex.EncodeToString(payloadRef1), hex.EncodeToString(payloadEnc1))

	// Messages are encrypted with DeviceSecret.Counter
	// uint64 overflows to 0, which is the expected behaviour

	// Test with a wrong counter value
	payloadClr1, decryptInfo, err := bertycrypto.OpenPayload(ctx, mkh2, cid.Undef, payloadEnc1, mustMessageHeaders(t, omd1.Device.GetPublic(), initialCounter+2))
	assert.Error(t, err)
	assert.Nil(t, decryptInfo)
	assert.Equal(t, "", string(payloadClr1))

	// Test with a valid counter value, but no CID (so no cache)
	payloadClr1, decryptInfo, err = bertycrypto.OpenPayload(ctx, mkh2, cid.Undef, payloadEnc1, mustMessageHeaders(t, omd1.Device.GetPublic(), initialCounter+1))
	assert.NoError(t, err)
	assert.Equal(t, string(payloadRef1), string(payloadClr1))

	err = bertycrypto.PostDecryptActions(ctx, mkh2, decryptInfo, g, omd2.Device.GetPublic(), mustMessageHeaders(t, omd1.Device.GetPublic(), initialCounter+1))
	assert.NoError(t, err)

	ds, err := mkh1.GetDeviceChainKey(ctx, omd1.Device.GetPublic())
	assert.NoError(t, err)

	assert.Equal(t, ds.Counter, initialCounter+1)
	assert.NotEqual(t, ds.ChainKey, firstSK)

	payloadEnc2, _, err := bertycrypto.SealPayload(payloadRef1, ds, omd1.Device, g)
	assert.NoError(t, err)

	err = bertycrypto.DeriveDeviceSecret(ctx, mkh1, g, omd1.Device)
	assert.NoError(t, err)

	// Ensure that encrypted message is not the same as the first message
	assert.NotEqual(t, hex.EncodeToString(payloadRef1), hex.EncodeToString(payloadEnc2))
	assert.NotEqual(t, hex.EncodeToString(payloadEnc1), hex.EncodeToString(payloadEnc2))

	payloadClr2, decryptInfo, err := bertycrypto.OpenPayload(ctx, mkh2, cid.Undef, payloadEnc2, mustMessageHeaders(t, omd1.Device.GetPublic(), initialCounter+2))
	assert.NoError(t, err)

	err = bertycrypto.PostDecryptActions(ctx, mkh2, decryptInfo, g, omd2.Device.GetPublic(), mustMessageHeaders(t, omd1.Device.GetPublic(), initialCounter+2))
	assert.NoError(t, err)

	assert.Equal(t, string(payloadRef1), string(payloadClr2))

	// Make sure that a message without a CID can't be decrypted twice
	payloadClr2, decryptInfo, err = bertycrypto.OpenPayload(ctx, mkh2, cid.Undef, payloadEnc2, mustMessageHeaders(t, omd1.Device.GetPublic(), initialCounter+1))
	assert.Error(t, err)
	assert.Equal(t, "", string(payloadClr2))

	ds, err = mkh1.GetDeviceChainKey(ctx, omd1.Device.GetPublic())
	assert.NoError(t, err)

	// Make sure that a message a CID can be decrypted twice
	payloadEnc3, _, err := bertycrypto.SealPayload(payloadRef2, ds, omd1.Device, g)
	assert.NoError(t, err)

	err = bertycrypto.DeriveDeviceSecret(ctx, mkh1, g, omd1.Device)
	assert.NoError(t, err)

	dummyCID1, err := cid.Parse("QmbdQXQh9B2bWZgZJqfbjNPV5jGN2owbQ3vjeYsaDaCDqU")
	assert.NoError(t, err)

	dummyCID2, err := cid.Parse("Qmf8oj9wbfu73prNAA1cRQVDqA52gD5B3ApnYQQjcjffH4")
	assert.NoError(t, err)

	// Not decrypted message yet, wrong counter value
	payloadClr3, decryptInfo, err := bertycrypto.OpenPayload(ctx, mkh2, dummyCID1, payloadEnc3, mustMessageHeaders(t, omd1.Device.GetPublic(), initialCounter+2))
	assert.Error(t, err)
	assert.Equal(t, "", string(payloadClr3))

	payloadClr3, decryptInfo, err = bertycrypto.OpenPayload(ctx, mkh2, dummyCID1, payloadEnc3, mustMessageHeaders(t, omd1.Device.GetPublic(), initialCounter+3))
	assert.NoError(t, err)
	assert.Equal(t, string(payloadRef2), string(payloadClr3))

	err = bertycrypto.PostDecryptActions(ctx, mkh2, decryptInfo, g, omd2.Device.GetPublic(), mustMessageHeaders(t, omd1.Device.GetPublic(), initialCounter+3))
	assert.NoError(t, err)

	payloadClr3, decryptInfo, err = bertycrypto.OpenPayload(ctx, mkh2, dummyCID1, payloadEnc3, mustMessageHeaders(t, omd1.Device.GetPublic(), initialCounter+3))
	assert.NoError(t, err)
	assert.Equal(t, string(payloadRef2), string(payloadClr3))

	err = bertycrypto.PostDecryptActions(ctx, mkh2, decryptInfo, g, omd2.Device.GetPublic(), mustMessageHeaders(t, omd1.Device.GetPublic(), initialCounter+3))
	assert.NoError(t, err)

	// Wrong CID
	payloadClr3, decryptInfo, err = bertycrypto.OpenPayload(ctx, mkh2, dummyCID2, payloadEnc3, mustMessageHeaders(t, omd1.Device.GetPublic(), initialCounter+3))
	assert.Error(t, err)
	assert.Equal(t, "", string(payloadClr3))

	// Reused CID, wrong counter value
	payloadClr3, decryptInfo, err = bertycrypto.OpenPayload(ctx, mkh2, dummyCID1, payloadEnc3, mustMessageHeaders(t, omd1.Device.GetPublic(), initialCounter+4))
	assert.Error(t, err)
	assert.Equal(t, "", string(payloadClr3))

	massExpected := uint64(200)

	// Test appending 200 messages, to ensure new secrets are generated correctly
	for i := uint64(0); i < massExpected; i++ {
		ds, err = mkh1.GetDeviceChainKey(ctx, omd1.Device.GetPublic())
		assert.NoError(t, err)

		payloadEnc, _, err := bertycrypto.SealPayload(payloadRef3, ds, omd1.Device, g)
		assert.NoError(t, err)

		err = bertycrypto.DeriveDeviceSecret(ctx, mkh1, g, omd1.Device)
		assert.NoError(t, err)

		ds, err = mkh1.GetDeviceChainKey(ctx, omd1.Device.GetPublic())
		assert.NoError(t, err)

		counter := ds.Counter

		payloadClr, decryptInfo, err := bertycrypto.OpenPayload(ctx, mkh2, cid.Undef, payloadEnc, mustMessageHeaders(t, omd1.Device.GetPublic(), counter))
		if !assert.NoError(t, err) {
			t.Fatalf("failed at i = %d", i)
		}

		err = bertycrypto.PostDecryptActions(ctx, mkh2, decryptInfo, g, omd2.Device.GetPublic(), mustMessageHeaders(t, omd1.Device.GetPublic(), counter))
		assert.NoError(t, err)

		assert.Equal(t, string(payloadRef3), string(payloadClr))
	}

	ds, err = mkh1.GetDeviceChainKey(ctx, omd1.Device.GetPublic())
	assert.NoError(t, err)

	assert.Equal(t, initialCounter+massExpected+3, ds.Counter)
}

func Test_EncryptMessageEnvelope(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	g, _, err := bertyprotocol.NewGroupMultiMember()
	assert.NoError(t, err)

	acc1 := account.New(keystore.NewMemKeystore())
	mkh1 := bertycrypto.NewInMemoryMessageKeys()
	omd1, err := acc1.MemberDeviceForGroup(g)
	assert.NoError(t, err)

	gc1 := orbitutil.NewContextGroup(g, nil, nil, mkh1, omd1)

	ds1, err := account.NewDeviceSecret()
	assert.NoError(t, err)

	err = bertycrypto.RegisterChainKey(ctx, mkh1, g, gc1.DevicePubKey(), ds1, true)
	assert.NoError(t, err)

	acc2 := account.New(keystore.NewMemKeystore())
	mkh2 := bertycrypto.NewInMemoryMessageKeys()
	omd2, err := acc2.MemberDeviceForGroup(g)
	assert.NoError(t, err)

	ds2, err := account.NewDeviceSecret()
	assert.NoError(t, err)

	payloadRef1 := []byte("Test payload 1")

	err = bertycrypto.RegisterChainKey(ctx, mkh2, g, omd2.Device.GetPublic(), ds2, true)
	assert.NoError(t, err)

	err = bertycrypto.RegisterChainKey(ctx, mkh2, g, omd1.Device.GetPublic(), ds1, false)
	assert.NoError(t, err)

	env1, err := bertycrypto.SealEnvelopeInternal(payloadRef1, ds1, omd1.Device, g)
	assert.NoError(t, err)

	headers, payloadClr1, decryptInfo, err := bertycrypto.OpenEnvelope(ctx, mkh2, g, env1, cid.Undef)
	assert.NoError(t, err)

	err = bertycrypto.PostDecryptActions(ctx, mkh2, decryptInfo, g, omd2.Device.GetPublic(), headers)
	assert.NoError(t, err)

	devRaw, err := omd1.Device.GetPublic().Raw()
	assert.Equal(t, headers.DevicePK, devRaw)
	assert.Equal(t, payloadRef1, payloadClr1)
}

func Test_EncryptMessageEnvelopeAndDerive(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	g, _, err := bertyprotocol.NewGroupMultiMember()
	assert.NoError(t, err)

	acc1 := account.New(keystore.NewMemKeystore())
	acc2 := account.New(keystore.NewMemKeystore())

	omd1, err := acc1.MemberDeviceForGroup(g)
	assert.NoError(t, err)

	omd2, err := acc2.MemberDeviceForGroup(g)
	assert.NoError(t, err)

	ds1, err := account.NewDeviceSecret()
	assert.NoError(t, err)

	mkh1 := bertycrypto.NewInMemoryMessageKeys()
	mkh2 := bertycrypto.NewInMemoryMessageKeys()

	err = bertycrypto.RegisterChainKey(ctx, mkh1, g, omd1.Device.GetPublic(), ds1, true)
	assert.NoError(t, err)

	gc1 := orbitutil.NewContextGroup(g, nil, nil, mkh1, omd1)

	ds2, err := account.NewDeviceSecret()
	assert.NoError(t, err)

	err = bertycrypto.RegisterChainKey(ctx, mkh2, g, omd2.Device.GetPublic(), ds2, true)
	assert.NoError(t, err)

	err = bertycrypto.RegisterChainKey(ctx, mkh2, g, omd1.Device.GetPublic(), ds1, false)
	assert.NoError(t, err)

	initialCounter := ds1.Counter

	for i := 0; i < 1000; i++ {
		payloadRef := []byte(fmt.Sprintf("Test payload %d", i))
		envEncrypted, err := bertycrypto.SealEnvelope(ctx, mkh1, g, omd1.Device, payloadRef)
		assert.NoError(t, err)

		ds, err := mkh1.GetDeviceChainKey(ctx, gc1.DevicePubKey())
		if !assert.NoError(t, err) {
			t.Fatalf("failed at i = %d", i)
		}
		assert.Equal(t, ds.Counter, initialCounter+uint64(i+1))

		headers, payloadClr, decryptInfo, err := bertycrypto.OpenEnvelope(ctx, mkh2, g, envEncrypted, cid.Undef)
		if !assert.NoError(t, err) {
			t.Fatalf("failed at i = %d", i)
		}

		err = bertycrypto.PostDecryptActions(ctx, mkh2, decryptInfo, g, omd2.Device.GetPublic(), headers)
		assert.NoError(t, err)

		if assert.NotNil(t, headers) && assert.NotNil(t, payloadClr) {
			devRaw, err := omd1.Device.GetPublic().Raw()
			assert.NoError(t, err)

			assert.Equal(t, headers.DevicePK, devRaw)
			assert.Equal(t, payloadRef, payloadClr)
		} else {
			break
		}
	}
}

func testMessageKeyHolderCatchUp(t *testing.T, expectedNewDevices int, isSlow bool) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if isSlow {
		testutil.SkipSlow(t)
	}

	dir := path.Join(os.TempDir(), fmt.Sprintf("%d", os.Getpid()), "MessageKeyHolderCatchUp")
	defer os.RemoveAll(dir)

	peers, _ := orbitutil.CreatePeersWithGroup(ctx, t, dir, 1, 1)
	peer := peers[0]

	mkh1 := peer.MK
	ms1 := peer.GC.MetadataStore()

	devicesPK := make([]crypto.PubKey, expectedNewDevices)
	deviceSecrets := make([]*bertyprotocol.DeviceSecret, expectedNewDevices)

	for i := 0; i < expectedNewDevices; i++ {
		devicesPK[i], deviceSecrets[i] = addDummyMemberInMetadataStore(ctx, t, ms1, peer.GC.Group(), peer.GC.MemberPubKey(), true)
	}

	err := orbitutil.FillMessageKeysHolderUsingPreviousData(ctx, peer.GC)
	assert.NoError(t, err)

	for i, dPK := range devicesPK {
		ds, err := mkh1.GetDeviceChainKey(ctx, dPK)
		if assert.NoError(t, err) {
			assert.Equal(t, deviceSecrets[i].Counter+uint64(mkh1.GetPrecomputedKeyExpectedCount()), ds.Counter)
			// Not testing chain key value as we need to derive it from the generated value
		} else {
			t.Fatalf("failed at iteration %d", i)
		}
	}

}

func TestMessageKeyHolderCatchUp(t *testing.T) {
	for _, testCase := range []struct {
		expectedNewDevices int
		slow               bool
	}{
		{
			expectedNewDevices: 2,
			slow:               false,
		},
		{
			expectedNewDevices: 10,
			slow:               true,
		},
	} {
		testMessageKeyHolderCatchUp(t, testCase.expectedNewDevices, testCase.slow)
	}
}

func testMessageKeyHolderSubscription(t *testing.T, expectedNewDevices int, isSlow bool) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if isSlow {
		testutil.SkipSlow(t)
	}

	dir := path.Join(os.TempDir(), fmt.Sprintf("%d", os.Getpid()), "MessageKeyHolderSubscription")
	defer os.RemoveAll(dir)

	peers, _ := orbitutil.CreatePeersWithGroup(ctx, t, dir, 1, 1)
	defer orbitutil.DropPeers(t, peers)

	peer := peers[0]

	mkh1 := peer.MK
	ms1 := peer.GC.MetadataStore()

	devicesPK := make([]crypto.PubKey, expectedNewDevices)
	deviceSecrets := make([]*bertyprotocol.DeviceSecret, expectedNewDevices)

	go orbitutil.FillMessageKeysHolderUsingNewData(ctx, peer.GC)

	for i := 0; i < expectedNewDevices; i++ {
		devicesPK[i], deviceSecrets[i] = addDummyMemberInMetadataStore(ctx, t, ms1, peer.GC.Group(), peer.GC.MemberPubKey(), true)
	}

	<-time.After(time.Millisecond * 100)

	for i, dPK := range devicesPK {
		ds, err := mkh1.GetDeviceChainKey(ctx, dPK)
		if assert.NoError(t, err) {
			assert.Equal(t, deviceSecrets[i].Counter+uint64(mkh1.GetPrecomputedKeyExpectedCount()), ds.Counter)
			// Not testing chain key value as we need to derive it from the generated value
		}
	}
}

func TestMessageKeyHolderSubscription(t *testing.T) {
	for _, testCase := range []struct {
		expectedNewDevices int
		slow               bool
	}{
		{
			expectedNewDevices: 2,
			slow:               false,
		},
		{
			expectedNewDevices: 10,
			slow:               true,
		},
	} {
		testMessageKeyHolderSubscription(t, testCase.expectedNewDevices, testCase.slow)
	}
}
