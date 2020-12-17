// +build mage

package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"golang.org/x/crypto/sha3"
)

func htgtTargetPath(target string, sources []string, env []string, implem func() error, phony bool) error {
	// FIXME: race condition: if a source is modified externally while the rule is running, the written manifest could be desynced
	if newSources, err := htgtPath(target, env, sources...); err != nil || !newSources {
		if err != nil {
			return err
		}
		if !phony {
			return errUpToDate
		}
	}

	if err := implem(); err != nil {
		return err
	}

	if err := htgtManifestWritePath(target, env, sources...); err != nil {
		return err
	}

	return nil
}

func htgtHashLink(path string) (string, error) {
	real, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	return "l:" + real, nil
}

func htgtHashDir(path string) (string, error) {
	fmt.Println("hashing", path)
	start := time.Now()
	defer func() {
		end := time.Now()
		fmt.Println("hashed", path, "in", end.Sub(start))
	}()

	man := path + "\n"
	if err := filepath.Walk(path, func(subPath string, info os.FileInfo, err error) error {
		oerr := error(nil)
		if err == nil && info.IsDir() {
			if info.Mode()&os.ModeSymlink != 0 {
				oerr = filepath.SkipDir
			} else {
				man += subPath + " d:-\n"
				return nil
			}
		}
		h, err := htgt_Hash(subPath, info, err)
		if err != nil {
			return err
		}
		man += subPath + " " + h + "\n"
		return oerr
	}); err != nil {
		return "", err
	}

	fmt.Println("man\n", man)

	return "d:" + stringBase64Sha3(man), nil
}

func htgtHashFile(path string) (string, error) {
	h, err := fileBase64Sha3(path)
	if err != nil {
		return "", err
	}
	return "f:" + h, nil
}

func htgt_Hash(path string, info os.FileInfo, err error) (string, error) {
	// fmt.Println("hash", path)

	if os.IsNotExist(err) {
		return "void", nil
	}
	if err != nil {
		return "error", err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return htgtHashLink(path)
	}
	if info.IsDir() {
		return htgtHashDir(path)
	}
	return htgtHashFile(path)
}

func htgtHash(path string) (string, error) {
	info, err := os.Stat(path)
	return htgt_Hash(path, info, err)
}

var errUpToDate = errors.New("up-to-date")

func htgtTargetGlob(target string, globs []string, env []string, implem func() error, phony bool) error {
	srcs := []string{}
	for _, g := range globs {
		if !strings.ContainsRune(g, '*') {
			srcs = append(srcs, g)
			continue
		}
		matches, err := filepath.Glob(g)
		if err != nil {
			return err
		}
		srcs = append(srcs, matches...)
	}

	return htgtTargetPath(target, srcs, env, implem, phony)
}

func htgtInfoDir(target string) string {
	return path.Join(".build-info", path.Dir(target))
}

func htgtInfoPath(target string) string {
	return path.Join(htgtInfoDir(target), path.Base(target)+".txt")
}

func htgtGlob(target string, env []string, globs ...string) (bool, error) {
	srcs := []string{}
	for _, g := range globs {
		matches, err := filepath.Glob(g)
		if err != nil {
			return true, err
		}
		srcs = append(srcs, matches...)
	}
	return htgtPath(target, env, srcs...)
}

func htgtPath(target string, env []string, srcs ...string) (bool, error) {
	if !strings.HasPrefix(target, ".meta/") {
		if _, err := os.Stat(target); os.IsNotExist(err) {
			return true, nil
		}
	}

	targetManifest := htgtInfoPath(target)

	if _, err := os.Stat(targetManifest); err != nil && os.IsNotExist(err) {
		return true, nil
	}

	oldManif, err := ioutil.ReadFile(targetManifest)
	if err != nil {
		return true, err
	}

	newManif, err := htgtManifestGenerate([]string{target}, env, srcs)
	if err != nil {
		return true, err
	}

	hasDiff := string(oldManif) != newManif
	if hasDiff {
		err := os.Remove(targetManifest)
		if err != nil {
			return true, err
		}
	}

	return hasDiff, nil
}

func htgtManifestWriteGlob(target string, env []string, globs ...string) error {
	srcs := []string{}
	for _, g := range globs {
		if !strings.ContainsRune(g, '*') {
			srcs = append(srcs, g)
			continue
		}
		matches, err := filepath.Glob(g)
		if err != nil {
			return err
		}
		srcs = append(srcs, matches...)
	}
	return htgtManifestWritePath(target, env, srcs...)
}

func htgtManifestWritePath(target string, env []string, srcs ...string) error {
	manif, err := htgtManifestGenerate([]string{target}, env, srcs)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(htgtInfoDir(target), os.ModePerm); err != nil {
		return err
	}

	return ioutil.WriteFile(htgtInfoPath(target), ([]byte)(manif), os.ModePerm)
}

func fileBase64Sha3(fp string) (string, error) {
	f, err := os.Open(fp)
	if err != nil {
		return "", err
	}

	h := sha3.New256()

	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return base64.StdEncoding.EncodeToString(h.Sum([]byte{})), nil
}

func stringBase64Sha3(str string) string {
	h := sha3.Sum256([]byte(str))
	return base64.StdEncoding.EncodeToString(h[:])
}

func htgtManifestGenerate(outputs []string, env []string, srcs []string) (string, error) {
	manifestLines := []string(nil)

	if len(outputs) > 0 {
		manifestLines = append(manifestLines, "Outputs:", "")
		sums := make(map[string]string)
		for _, src := range outputs {
			cleanSrc := path.Clean(src)
			s, err := htgtHash(cleanSrc)
			if err != nil {
				return "", err
			}
			sums[cleanSrc] = s
		}

		sumsKeys := strdictKeys(sums)
		sort.Strings(sumsKeys)
		for _, k := range sumsKeys {
			manifestLines = append(manifestLines, k+" "+sums[k])
		}
	}

	if len(env) > 0 {
		if len(outputs) > 0 {
			manifestLines = append(manifestLines, "")
		}

		manifestLines = append(manifestLines, "Environment:", "")
		sort.Strings(env)
		for _, key := range env {
			value := os.Getenv(key)
			manifestLines = append(manifestLines, key+"="+value)
		}
	}

	if len(srcs) > 0 {
		if len(env) > 0 || len(outputs) > 0 {
			manifestLines = append(manifestLines, "")
		}

		manifestLines = append(manifestLines, "Sources:", "")

		sums := make(map[string]string)
		for _, src := range srcs {
			cleanSrc := path.Clean(src)
			s, err := htgtHash(cleanSrc)
			if err != nil {
				return "", err
			}
			sums[cleanSrc] = s
		}

		sumsKeys := strdictKeys(sums)
		sort.Strings(sumsKeys)
		for _, k := range sumsKeys {
			manifestLines = append(manifestLines, k+" "+sums[k])
		}
	}

	return strings.Join(manifestLines, "\n") + "\n", nil
}

func strdictKeys(sd map[string]string) []string {
	keys := []string(nil)
	for k := range sd {
		keys = append(keys, k)
	}
	return keys
}

func removeDuplicatesUnordered(elements []string) []string {
	// https://www.dotnetperls.com/duplicates-go

	encountered := map[string]bool{}

	// Create a map of all unique elements.
	for v := range elements {
		encountered[elements[v]] = true
	}

	// Place all keys from the map into a slice.
	result := []string{}
	for key, _ := range encountered {
		result = append(result, key)
	}
	return result
}
