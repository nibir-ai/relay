import express = require('express');
import { relay, relayFastify, type RelayOptions } from 'relay-backend';
import Fastify = require('fastify');
const options: RelayOptions = { openapi: () => ({openapi:'3.1.0',info:{title:'Portal',version:'1'},paths:{}}), syncStatus:true };
express().use(relay(options));
Fastify().register(relayFastify,options);
