BUILDDIR := build
NAME := ipvfoo
MANIFEST := src/manifest.json
MANIFEST_F := src/manifest/firefox-manifest.json
MANIFEST_C := src/manifest/chrome-manifest.json
MANIFEST_F2 := src/manifest/firefox-manifest-mv2.json
MANIFEST_C2 := src/manifest/chrome-manifest-mv2.json
version_from = $(shell sed -n 's/^ *"version": *"\\([0-9.]\\+\\)".*/\\1/p' $(1) | head -n1)

BROWSER ?= chrome
ifeq ($(BROWSER),chrome)
UNPACKED ?= 1
else
UNPACKED ?= 0
endif

ifeq ($(BROWSER),firefox)
MANIFEST_MV3 := ${MANIFEST_F}
MANIFEST_MV2 := ${MANIFEST_F2}
PKG_EXT := xpi
else ifeq ($(BROWSER),chrome)
MANIFEST_MV3 := ${MANIFEST_C}
MANIFEST_MV2 := ${MANIFEST_C2}
PKG_EXT := zip
else
$(error BROWSER must be chrome or firefox)
endif

VERSION_MV3 := $(call version_from,${MANIFEST_MV3})
VERSION_MV2 := $(call version_from,${MANIFEST_MV2})

MV3_OUT := ${BUILDDIR}/${NAME}-${VERSION_MV3}-mv3.${PKG_EXT}
MV2_OUT := ${BUILDDIR}/${NAME}-${VERSION_MV2}-mv2.${PKG_EXT}
MV3_UNPACKED := ${BUILDDIR}/${NAME}-${VERSION_MV3}-mv3-unpacked
MV2_UNPACKED := ${BUILDDIR}/${NAME}-${VERSION_MV2}-mv2-unpacked

all: prepare mv3 mv2

define build_pack
	rm -f $(1)
	cp -f $(2) ${MANIFEST}
	zip -9j $(1) src/*
endef

.PHONY: all prepare mv3 mv2 clean

prepare:
	@diff ${MANIFEST} ${MANIFEST_F} >/dev/null || \
		diff ${MANIFEST} ${MANIFEST_C} >/dev/null || \
		diff ${MANIFEST} ${MANIFEST_F2} >/dev/null || \
		diff ${MANIFEST} ${MANIFEST_C2} >/dev/null || \
		(echo "${MANIFEST} is not a copy of ${MANIFEST_F}, ${MANIFEST_C}, ${MANIFEST_F2}, or ${MANIFEST_C2}; aborting."; exit 1)
	rm -rf ${BUILDDIR}
	mkdir -p ${BUILDDIR}

mv3: prepare
	$(call build_pack,${MV3_OUT},${MANIFEST_MV3})
	if [ "$(UNPACKED)" != "0" ]; then \
		rm -rf ${MV3_UNPACKED}; \
		mkdir -p ${MV3_UNPACKED}; \
		cp -R src/* ${MV3_UNPACKED}/; \
	fi

mv2: prepare
	$(call build_pack,${MV2_OUT},${MANIFEST_MV2})
	if [ "$(UNPACKED)" != "0" ]; then \
		rm -rf ${MV2_UNPACKED}; \
		mkdir -p ${MV2_UNPACKED}; \
		cp -R src/* ${MV2_UNPACKED}/; \
	fi

clean:
	rm -rf ${BUILDDIR}
