## Build docker image

```bash
docker build -t comfy-ui-headless .
```

## Run docker image

```bash
docker compose up
```

```bash
docker run -it --rm -p 8188:8188 -v $(pwd)/src/data:/data -v $(pwd)/src/output:/output -v $(pwd)/src/models:/models --stop-signal=SIGINT --name comfy comfy-ui-headless:latest
```
