.PHONY: build rebuild start stop

IMAGE := critic
CONTAINER := critic

ifneq ("$(wildcard .env)","")
include .env
export
endif

PORT ?= 3000

build:
	docker build -t $(IMAGE) .
	docker run -d --name $(CONTAINER) --env-file .env -e PORT=$(PORT) -p $(PORT):$(PORT) --restart unless-stopped $(IMAGE)

rebuild:
	-docker stop $(CONTAINER)
	-docker rm $(CONTAINER)
	docker build --no-cache -t $(IMAGE) .
	docker run -d --name $(CONTAINER) --env-file .env -e PORT=$(PORT) -p $(PORT):$(PORT) --restart unless-stopped $(IMAGE)

start:
	docker start $(CONTAINER)

stop:
	docker stop $(CONTAINER)

fake-plan:
	./tests/run_fake_plan.sh
