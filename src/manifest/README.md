IPvFoo uses a different manifest.json file for Chrome vs. Firefox, and
for MV2 vs. MV3.
One must be copied to the parent directory:

```
cp firefox-manifest.json ../manifest.json        # MV3 Firefox
cp chrome-manifest.json ../manifest.json         # MV3 Chrome
cp firefox-manifest-mv2.json ../manifest.json    # MV2 Firefox
cp chrome-manifest-mv2.json ../manifest.json     # MV2 Chrome
```
