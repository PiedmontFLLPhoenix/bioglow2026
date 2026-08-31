#!/bin/bash
cd "$(dirname "$0")"

if ! command -v node >/dev/null; then
  echo; echo "  Node.js is not installed. Get it from https://nodejs.org"; echo
  read -n 1 -s -r -p "Press any key to close"; exit 1
fi

if ! command -v git >/dev/null; then
  echo; echo "  Git is not installed. Get it from https://git-scm.com"; echo
  read -n 1 -s -r -p "Press any key to close"; exit 1
fi

node server.js
