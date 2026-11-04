# Brand kits

Each folder here is one brand: `brand.json` plus its logos, fonts, backgrounds, intro/outro clips and `guidelines.md`.

```sh
pnpm run brand -- new acme --name "Acme"   # scaffold a kit
pnpm run brand -- sync                     # validate kits and write registry.json
pnpm run brand -- list                     # show kits and problems without writing
```

`registry.json` is generated; commit it together with the kit folders it describes. `example/` is an original sample kit you can copy. Full reference: `website/docs/brand-kits/`.
