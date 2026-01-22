BUILDDIR := build/
NAME := ipvfoo
MANIFEST := src/manifest.json
MANIFEST_F := src/manifest/firefox-manifest.json
MANIFEST_C := src/manifest/chrome-manifest.json
MANIFEST_F2 := src/manifest/firefox-manifest-mv2.json
MANIFEST_C2 := src/manifest/chrome-manifest-mv2.json
VERSION_F := $(shell cat ${MANIFEST_F} | \
	sed -n 's/^ *"version": *"\([0-9.]\+\)".*/\1/p' | \
	head -n1)
VERSION_C := $(shell cat ${MANIFEST_C} | \
	sed -n 's/^ *"version": *"\([0-9.]\+\)".*/\1/p' | \
	head -n1)
VERSION_F2 := $(shell cat ${MANIFEST_F2} | \
	sed -n 's/^ *"version": *"\([0-9.]\+\)".*/\1/p' | \
	head -n1)
VERSION_C2 := $(shell cat ${MANIFEST_C2} | \
	sed -n 's/^ *"version": *"\([0-9.]\+\)".*/\1/p' | \
	head -n1)

all: prepare firefox chrome firefox-mv2 chrome-mv2

prepare:
	@diff ${MANIFEST} ${MANIFEST_F} >/dev/null || \
		diff ${MANIFEST} ${MANIFEST_C} >/dev/null || \
		diff ${MANIFEST} ${MANIFEST_F2} >/dev/null || \
		diff ${MANIFEST} ${MANIFEST_C2} >/dev/null || \
		(echo "${MANIFEST} is not a copy of ${MANIFEST_F}, ${MANIFEST_C}, ${MANIFEST_F2}, or ${MANIFEST_C2}; aborting."; exit 1)
	mkdir -p build

firefox: prepare
	rm -f ${BUILDDIR}${NAME}-${VERSION_F}.xpi
	cp -f ${MANIFEST_F} ${MANIFEST}
	zip -9j ${BUILDDIR}${NAME}-${VERSION_F}.xpi -j src/*

chrome: prepare
	rm -f ${BUILDDIR}${NAME}-${VERSION_C}.zip
	cp -f ${MANIFEST_C} ${MANIFEST}
	zip -9j ${BUILDDIR}${NAME}-${VERSION_C}.zip -j src/*

firefox-mv2: prepare
	rm -f ${BUILDDIR}${NAME}-${VERSION_F2}-mv2.xpi
	cp -f ${MANIFEST_F2} ${MANIFEST}
	zip -9j ${BUILDDIR}${NAME}-${VERSION_F2}-mv2.xpi -j src/*

chrome-mv2: prepare
	rm -f ${BUILDDIR}${NAME}-${VERSION_C2}-mv2.zip
	cp -f ${MANIFEST_C2} ${MANIFEST}
	zip -9j ${BUILDDIR}${NAME}-${VERSION_C2}-mv2.zip -j src/*

clean:
	rm -rf ${BUILDDIR}
