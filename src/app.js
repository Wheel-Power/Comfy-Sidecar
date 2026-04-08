'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const healthRouter = require('./routes/health');
const agentsRouter = require('./routes/agents');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.use('/health', healthRouter);
app.use('/agents', agentsRouter);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
