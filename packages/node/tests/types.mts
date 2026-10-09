import express from 'express';
import Fastify from 'fastify';
import { relay, relayFastify } from 'relay-backend';
express().use(relay({ enabled:true }));
Fastify().register(relayFastify,{syncStatus:true});
