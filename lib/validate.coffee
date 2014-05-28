_ = require "lodash"
async = require "async"
valids = require "valids"

###*
 * Validates rules within a rule group asynchronously. This will stop
 * validating on first validation failure or error.
###
validateRuleGroup = (group, options, value, cb) ->
  displayName = options.displayName
  messages = options.messages

  async.eachSeries _.keys(group), (ruleName, cb) ->
    param = group[ruleName]
    if _.isFunction param
      # cb(err, message)
      param value, (err, message) ->
        # Treat validation errors and normal failures as errors since they
        # need to stop the asynchronous iteration immediately.
        cb err or message
    else
      # Validators from the valids library don't throw validation errors.
      # Only failures are passed. Since failures also need to stop the
      # asynchronous iteration, the message will be passed as an error.
      message = valids[ruleName] displayName, value, param, messages?[ruleName]
      if message then cb message else cb()
  , cb

###*
 * Validates a field and stops validating on first validation failure or error.
###
validateField = (fieldData, value, cb) ->
  # Get a user-friendly display name for the field.
  fieldSchema = fieldData.schema
  displayName = fieldSchema.displayName or fieldData.name

  # Get an array of rules grouped by priority with first and last in the
  # array corresponding to first and last in validation order.
  if _.isArray fieldSchema.rules
    rules = fieldSchema.rules
  else if fieldSchema.rules
    rules = [fieldSchema.rules]
  else
    rules = []

  # Validate individual rule groups synchronously.
  async.eachSeries rules, (group, cb) =>
    validateRuleGroup group,
      displayName: displayName
      messages: fieldData.messages
    , value, cb
  , cb

###*
 * Validates all values in data against the fields given in the schema.
###
validateAll = (formData, data, cb) ->
  valid = true
  messages = {}

  # Validate fields asynchronously. Do not stop on any validation failures.
  fieldNames = _.keys data
  async.each fieldNames, (fieldName, cb) ->
    fieldSchema = formData.schema[fieldName]
    fieldData =
      schema: fieldSchema
      name: fieldName
    validateField fieldData, data[fieldName], (message) ->
      if message
        valid = false
        messages[fieldName] = message
      cb()
  , ->
    if valid
      cb null, data
    else
      messageField = _.first _.intersection fieldNames, _.keys messages
      cb messages, data, messages[messageField]

module.exports = {validateAll}
