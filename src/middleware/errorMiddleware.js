import mongoose from 'mongoose';

// Middleware to handle errors
const errorHandler = (err, req, res, next) => {
  console.error('Error caught:', err.message, err.stack);
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  const message = err.message || 'Server Error';

  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
      error: err.message,
    });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((error) => error.message);
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors,
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

export default errorHandler ;
