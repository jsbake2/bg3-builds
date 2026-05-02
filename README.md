# BG3 Builds

A small, clean, self-hosted site that renders Baldur's Gate 3 build guides from
YAML files. Tabs at the top switch between builds. One YAML per build.

Live at: <http://10.0.0.16:8891/>

## Layout

```
site/
  index.html
  styles.css
  app.js                 # loads builds/index.json, fetches & renders YAML
  lib/js-yaml.min.js     # vendored
  builds/
    index.json           # list of available builds (id, file, name, tagline)
    wood-elf-bardadin.yaml
deploy/
  bg3-builds.service     # systemd unit
  deploy.sh              # rsync + systemd install/restart
```

## Adding a new build

1. Drop a `<id>.yaml` into `site/builds/` following the schema used by
   `wood-elf-bardadin.yaml` (meta, overview, character_creation,
   stats_progression, leveling, spells, gear, playstyle,
   abilities_situational, mistakes_and_tips).
2. Add an entry to `site/builds/index.json`.
3. `./deploy/deploy.sh` to ship it.

## Deploy

```
./deploy/deploy.sh
```

Rsyncs `site/` to `10.0.0.16:/home/jbaker/bg3-builds-site/`, installs the
systemd unit if missing, and restarts the service.

The service is also registered in
[services-panel-api](https://github.com/jsbake2/services-panel-api) under
the `bg3-builds` key so it can be controlled from the services panel.
