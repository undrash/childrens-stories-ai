## Build docker image

```bash
docker build -t comfy-ui-headless .
```

## Run docker image

```bash
docker compose up
```

```bash
docker run -it --rm -p 8188:8188 --stop-signal=SIGINT --name comfy comfy-ui-headless:latest
```
