.PHONY: build rebuild start stop

IMAGE := critic
CONTAINER := critic
PORT ?= 3000

build:
	docker build -t $(IMAGE) .
	docker run -d --name $(CONTAINER) --env-file .env -p $(PORT):3000 --restart unless-stopped $(IMAGE)

rebuild:
	-docker stop $(CONTAINER)
	-docker rm $(CONTAINER)
	docker build --no-cache -t $(IMAGE) .
	docker run -d --name $(CONTAINER) --env-file .env -p $(PORT):3000 --restart unless-stopped $(IMAGE)

start:
	docker start $(CONTAINER)

stop:
	docker stop $(CONTAINER)
