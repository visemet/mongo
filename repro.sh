#!/bin/bash
time python buildscripts/smoke.py \
    --storageEngine=wiredtiger \
    "$@" \
    repro.js
