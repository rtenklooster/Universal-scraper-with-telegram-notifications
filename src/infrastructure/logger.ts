import winston from 'winston';
import config from './config';

// Algemene logger voor applicatie logs
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Specifieke logger voor user input
export const userLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, message, userId, username }) => {
      const userInfo = username ? `${username} (${userId})` : `User ${userId}`;
      return `${timestamp} [${userInfo}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/user_activity.log'
    })
  ]
});

export default logger;