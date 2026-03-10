.PHONY: build rebuild start stop

build:
	docker compose up --build -d

rebuild:
	docker compose down
	docker compose build --no-cache
	docker compose up -d

start:
	docker compose up -d

stop:
	docker compose down
