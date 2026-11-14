PROJECT ?= $(CURDIR)
IRSIM := $(CURDIR)/bin/irsim
PORT_ARG := $(if $(filter command line,$(origin PORT)),--port $(PORT))
DESIGN_DIR_ARG := $(if $(filter command line,$(origin DESIGN_DIR)),--design-dir "$(DESIGN_DIR)")
OUT_ARG := $(if $(filter command line,$(origin OUT)),--out "$(OUT)")

.PHONY: serve reload port build thumbs preview deps help

help:
	@echo "make serve [PROJECT=<path>] [PORT=<n>] [DESIGN_DIR=<path>]    run this checkout's canvas on PROJECT (default: this repo)"
	@echo "make reload [PROJECT=<path>] [PORT=<n>]                       stop the canvas now running for PROJECT, then serve this checkout"
	@echo "make port [PROJECT=<path>]                                    print the port serve would use"
	@echo "make build [PROJECT=<path>]                                   register the boards on disk in canvas.json"
	@echo "make thumbs [PROJECT=<path>]                                  queue the board thumbnails on the running canvas"
	@echo "make preview [PROJECT=<path>] [OUT=<dir>]                     build the standalone preview (default: dist/preview)"
	@echo "make deps                                                     bun install in app/"

deps: app/node_modules

app/node_modules: app/bun.lock
	cd app && bun install
	@touch app/node_modules

serve: deps
	cd "$(PROJECT)" && exec "$(IRSIM)" serve $(PORT_ARG) $(DESIGN_DIR_ARG)

reload: deps
	@scripts/reload.sh "$(PROJECT)" $(if $(PORT_ARG),$(PORT))
	cd "$(PROJECT)" && exec "$(IRSIM)" serve $(PORT_ARG) $(DESIGN_DIR_ARG)

port:
	cd "$(PROJECT)" && "$(IRSIM)" port

build:
	cd "$(PROJECT)" && "$(IRSIM)" build $(DESIGN_DIR_ARG)

thumbs:
	cd "$(PROJECT)" && "$(IRSIM)" thumbs

preview:
	cd "$(PROJECT)" && "$(IRSIM)" export $(DESIGN_DIR_ARG) $(OUT_ARG)
