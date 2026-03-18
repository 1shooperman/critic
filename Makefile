.PHONY: build rebuild start stop

IMAGE := critic
CONTAINER := critic

# Use PORT from .env so make build/rebuild respect the same port as the app
PORT := $(shell grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2)
PORT ?= 3000

build:
	docker build -t $(IMAGE) .
	docker run -d --name $(CONTAINER) --env-file .env -p $(PORT):$(PORT) --restart unless-stopped $(IMAGE)

rebuild:
	-docker stop $(CONTAINER)
	-docker rm $(CONTAINER)
	docker build --no-cache -t $(IMAGE) .
	docker run -d --name $(CONTAINER) --env-file .env -p $(PORT):$(PORT) --restart unless-stopped $(IMAGE)

start:
	docker start $(CONTAINER)

stop:
	docker stop $(CONTAINER)

fake-plan:
	./tests/run_fake_plan.sh
