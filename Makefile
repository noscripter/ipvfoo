BUILDDIR := build
NAME := ipvfoo
MANIFEST := src/manifest.json
MANIFEST_F := src/manifest/firefox-manifest.json
MANIFEST_C := src/manifest/chrome-manifest.json
MANIFEST_F2 := src/manifest/firefox-manifest-mv2.json
MANIFEST_C2 := src/manifest/chrome-manifest-mv2.json
version_from = $(shell sed -n 's/^ *"version": *"\\([0-9.]\\+\\)".*/\\1/p' $(1) | head -n1)
VERSION_F := $(call version_from,${MANIFEST_F})
VERSION_C := $(call version_from,${MANIFEST_C})
VERSION_F2 := $(call version_from,${MANIFEST_F2})
VERSION_C2 := $(call version_from,${MANIFEST_C2})

FIREFOX_MV3_OUT := ${BUILDDIR}/${NAME}-${VERSION_F}-firefox-mv3.xpi
CHROME_MV3_OUT := ${BUILDDIR}/${NAME}-${VERSION_C}-chrome-mv3.zip
FIREFOX_MV2_OUT := ${BUILDDIR}/${NAME}-${VERSION_F2}-firefox-mv2.xpi
CHROME_MV2_OUT := ${BUILDDIR}/${NAME}-${VERSION_C2}-chrome-mv2.zip

all: prepare firefox chrome firefox-mv2 chrome-mv2

define build_pack
	rm -f $(1)
	cp -f $(2) ${MANIFEST}
	zip -9j $(1) src/*
endef

.PHONY: all prepare firefox chrome firefox-mv2 chrome-mv2 clean

prepare:
	@diff ${MANIFEST} ${MANIFEST_F} >/dev/null || \
		diff ${MANIFEST} ${MANIFEST_C} >/dev/null || \
		diff ${MANIFEST} ${MANIFEST_F2} >/dev/null || \
		diff ${MANIFEST} ${MANIFEST_C2} >/dev/null || \
		(echo "${MANIFEST} is not a copy of ${MANIFEST_F}, ${MANIFEST_C}, ${MANIFEST_F2}, or ${MANIFEST_C2}; aborting."; exit 1)
	rm -rf ${BUILDDIR}
	mkdir -p ${BUILDDIR}

firefox: prepare
	$(call build_pack,${FIREFOX_MV3_OUT},${MANIFEST_F})

chrome: prepare
	$(call build_pack,${CHROME_MV3_OUT},${MANIFEST_C})

firefox-mv2: prepare
	$(call build_pack,${FIREFOX_MV2_OUT},${MANIFEST_F2})

chrome-mv2: prepare
	$(call build_pack,${CHROME_MV2_OUT},${MANIFEST_C2})

clean:
	rm -rf ${BUILDDIR}
