import Joi from 'joi';

function formatJoiError(error) {
  return error.details.map((detail) => ({
    message: detail.message,
    path: detail.path.join('.'),
    type: detail.type,
  }));
}

export function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: 'Invalid request payload',
        details: formatJoiError(error),
      });
    }

    req.body = value;
    return next();
  };
}

export { Joi };