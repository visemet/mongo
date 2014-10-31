#!/bin/bash
time python buildscripts/smoke.py \
    --storageEngine=wiredtiger \
    "$@" \
    deadlock-repro.js
