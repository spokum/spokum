#!/bin/bash
cd "$(dirname "$0")"
PORT=4173 SPOKUM_WEB=/home/z/my-project/spokum-work/web exec node src/index.js
