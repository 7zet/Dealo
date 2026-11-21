package config

import (
	"net/netip"
	"testing"
)

func TestTrustedProxiesDefaultToLoopbackOnly(t *testing.T) {
	t.Parallel()
	got, err := load(emptyEnvironment)
	if err != nil {
		t.Fatal(err)
	}
	for _, addr := range []string{"127.0.0.1", "::1"} {
		if !contains(got.TrustedProxies, addr) {
			t.Errorf("%s is not trusted by default", addr)
		}
	}
	for _, addr := range []string{"10.0.0.5", "203.0.113.7"} {
		if contains(got.TrustedProxies, addr) {
			t.Errorf("%s is trusted by default", addr)
		}
	}
}

func TestTrustedProxiesReadsListAndPrivateNetworks(t *testing.T) {
	t.Parallel()
	got, err := load(mapEnvironment(map[string]string{
		"TRUSTED_PROXIES":     "198.51.100.4, 203.0.113.0/24",
		"TRUST_PROXY_HEADERS": "true",
	}))
	if err != nil {
		t.Fatal(err)
	}
	for _, addr := range []string{"198.51.100.4", "203.0.113.200", "10.1.2.3", "192.168.1.1", "127.0.0.1"} {
		if !contains(got.TrustedProxies, addr) {
			t.Errorf("%s should be trusted", addr)
		}
	}
	if contains(got.TrustedProxies, "198.51.100.5") {
		t.Error("198.51.100.5 should not be trusted")
	}

	if _, err := load(mapEnvironment(map[string]string{"TRUSTED_PROXIES": "not-an-ip"})); err == nil {
		t.Fatal("invalid TRUSTED_PROXIES was accepted")
	}
}

func contains(prefixes []netip.Prefix, addr string) bool {
	parsed := netip.MustParseAddr(addr)
	for _, prefix := range prefixes {
		if prefix.Contains(parsed) {
			return true
		}
	}
	return false
}
