// backend/src/utils/jobQueue.js
const Job = require('../models/Job');
const { logger } = require('./logger');
const transporter = require('../config/mail');

// Job Handlers Registry
const handlers = {
  EMAIL: async (payload) => {
    logger.info(`Processing EMAIL job for: ${payload.to}`);
    await transporter.sendMail(payload);
  }
};

let workerInterval = null;
let isProcessing = false;

// Queue a new background job
async function queueJob(type, payload, options = {}) {
  const { runAt = new Date(), maxAttempts = 5 } = options;
  
  const job = await Job.create({
    type,
    payload,
    runAt,
    maxAttempts
  });

  logger.info(`Queued job ${job._id} (Type: ${type}) to run at ${runAt}`);
  
  // Trigger worker check asynchronously to run immediately if possible
  setImmediate(() => {
    processNextJobs().catch(err => logger.error('Error triggering immediate job check', err));
  });

  return job;
}

// Atomic lock and process next available jobs
async function processNextJobs() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    let job;
    do {
      // Find oldest job that is pending or retry-ready, and lock it atomically
      job = await Job.findOneAndUpdate(
        {
          status: { $in: ['pending', 'failed'] },
          $expr: { $lt: ['$attempts', '$maxAttempts'] },
          runAt: { $lte: new Date() }
        },
        {
          $set: { status: 'processing' },
          $inc: { attempts: 1 }
        },
        { new: true, sort: { runAt: 1 } }
      );

      if (job) {
        logger.info(`Acquired job ${job._id} (Type: ${job.type}, Attempt: ${job.attempts}/${job.maxAttempts})`);
        
        const handler = handlers[job.type];
        if (!handler) {
          throw new Error(`No handler registered for job type: ${job.type}`);
        }

        try {
          // Execute handler
          await handler(job.payload);
          
          // On success, update status
          job.status = 'completed';
          job.error = undefined;
          await job.save();
          logger.info(`Job ${job._id} completed successfully`);
        } catch (jobError) {
          logger.error(`Job ${job._id} execution failed: ${jobError.stack || jobError.message}`);
          
          job.error = jobError.stack || jobError.message;
          if (job.attempts < job.maxAttempts) {
            job.status = 'failed'; // Reschedule for retry
            // Exponential backoff: retry in 2^attempts * 10 seconds
            const backoffMs = Math.pow(2, job.attempts) * 10 * 1000;
            job.runAt = new Date(Date.now() + backoffMs);
            logger.info(`Job ${job._id} rescheduled to retry at ${job.runAt} (after ${backoffMs / 1000}s backoff)`);
          } else {
            job.status = 'failed'; // Permanent fail
            logger.warn(`Job ${job._id} failed permanently after exceeding max attempts (${job.maxAttempts})`);
          }
          await job.save();
        }
      }
    } while (job);
  } catch (error) {
    logger.error('Error during job queue processing loop', error);
  } finally {
    isProcessing = false;
  }
}

// Start polling worker
function startWorker(intervalMs = 5000) {
  if (workerInterval) {
    logger.warn('Job queue worker is already running.');
    return;
  }

  logger.info('Starting background job queue worker...');
  workerInterval = setInterval(() => {
    processNextJobs().catch(err => logger.error('Error in job queue polling worker', err));
  }, intervalMs);
}

// Stop worker gracefully
function stopWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info('Job queue worker stopped.');
  }
}

module.exports = {
  queueJob,
  startWorker,
  stopWorker,
  handlers
};
