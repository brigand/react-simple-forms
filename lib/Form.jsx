var _ = require('lodash');
var React = require('react');
var invariant = require('react/lib/invariant');
var update = require('react/lib/update');
var RSVP = require('rsvp');

var eachElements = require('./utils/eachElements.js');

function isPromise(value) {
  return value && value.then;
}

var Form = React.createClass({
  propTypes: {
    validators: React.PropTypes.object,
    onSubmit: React.PropTypes.func,
    onSuccess: React.PropTypes.func,
    onErrors: React.PropTypes.func,
    errorClass: React.PropTypes.string,
    tabOnEnter: React.PropTypes.bool
  },

  componentWillMount: function() {
    this.setAvailableValidators(this.props);
  },

  componentWillReceiveProps: function(nextProps) {
    this.setAvailableValidators(nextProps);
  },

  getInitialState: function() {
    return {
      submitting: false,
      submitError: null,
      fields: {}
    };
  },

  getDefaultProps: function() {
    return {
      errorClass: 'Form-error',
      tabOnEnter: true
    };
  },

  getContext: function() {
    return {
      getField: this.getField,
      changeField: this.changeField,
      focus: this.focus,
      submit: this.submit,
      submitting: this.state.submitting,
      submitError: this.state.submitError,
      errorClass: this.props.errorClass
    };
  },

  focus: function(name) {
    this.focusedField = name;
    this.forceUpdate();
  },

  submit: function() {
    var self = this;

    if (this.props.onSubmit) {
      this.props.onSubmit();
    }

    this.setState({submitting: true, submitError: null});
    // Asynchronously wait for all loading validations before using errors.
    RSVP.hash(this._loadingValidators || {})
      .then(function() {
        var errors = _.mapValues(self.state.fields, 'error');
        var filteredErrors = _.pick(errors, _.identity);
        if (!_.isEmpty(filteredErrors)) {
          return self.handleErrors(filteredErrors);
        }

        return self.handleSuccess(_.mapValues(self.state.fields, 'value'));
      })
      .catch(function(err) {
        console.error((err && err.stack) || err);
      });
  },

  setAvailableValidators: function(props) {
    this.validatorNames = _.keys(props.validators);
  },

  validateField: function(name, value, validators) {
    var self = this;

    // Only check for errors if validators are defined for the field.
    if (!validators) {
      return RSVP.resolve(null);
    }

    // Combine into one resolved error string or null.
    return RSVP.all(_.map(validators, function(options, validatorName) {
      // Validator will return a validation result value (error or null) or
      // a promise that will be fulfilled with a validation result value.
      var result = self.props.validators[validatorName](value, options);
      if (!isPromise(result)) {
        // Convert static values to a resolved promise.
        if (result) {
          return RSVP.reject(result);
        }
        return RSVP.resolve();
      }
      return result.then(function(value) {
        if (value) {
          return RSVP.reject(value);
        }
        return null;
      });
    })).then(function(results) {
      return null;
    }).catch(function(err) {
      return err;
    });
  },

  handleErrors: function(errors) {
    if (this.props.onErrors) {
      this.props.onErrors(errors);
    }
    this.setState({submitting: false});
  },

  handleSuccess: function(data) {
    var self = this;
    if (this.props.onSuccess) {
      var callbackUsed = false;
      this.props.onSuccess(data, function(promise) {
        callbackUsed = true;
        promise.then(function() {
          self.setState({submitting: false});
        }).catch(function(err) {
          self.setState({submitError: err, submitting: false});
        });
      });

      if (callbackUsed) {
        return;
      }
    }

    self.setState({submitting: false});
  },

  isFocused: function(name) {
    return name === this.focusedField;
  },

  getField: function(name) {
    var values = this.props.values || {};
    return this.state.fields[name] || {
      value: (values[name] || null),
      state: 'valid',
      error: null,
      focused: this.isFocused(name)
    };
  },

  changeField: function(name, value, validators, pristine) {
    var self = this;

    // Do not set the initial value to null if there are default values.
    if (pristine && this.props.values) {
      value = this.props.values[name] || null;
    }

    // Check for undefined validators.
    var diff = _.difference(_.keys(validators), this.validatorNames);
    if (diff.length > 0) {
      invariant(false, 'Validator(s) `%s` were not defined in the form', diff);
    }

    var data = {};
    data[name] = {$set: {
      value: value,
      state: 'loading',
      error: null,
      focused: this.isFocused(name)
    }};
    this.setState({fields: update(this.state.fields, data)});

    // Keep track of loading validators.
    this._loadingValidators = this._loadingValidators || {};
    var promise = this.validateField(name, value, validators)
      .then(function(message) {
        var fieldData;
        if (message) {
          fieldData = {state: 'invalid', error: message};
        } else {
          fieldData = {state: 'valid'};
        }
        fieldData.pristine = pristine ? true : false;
        data = {};
        data[name] = {$merge: fieldData};
        self.setState({fields: update(self.state.fields, data)});
      })
      .finally(function() {
        delete self._loadingValidators[name];
      });

    this._loadingValidators[name] = promise;
  },

  handleKeyDown: function(e) {
    if (e.key === 'Enter') {
      var index = _.indexOf(this.fieldNames, this.focusedField);
      if (index + 1 < this.fieldNames.length) {
        this.focusedField = this.fieldNames[index + 1];
        this.forceUpdate();
      } else {
        this.submit();
      }
    }
  },

  render: function() {
    var formContext = this.getContext();
    // Add form data to all field props.
    var fieldNames = [];

    eachElements(this.props.children, function(child) {
      // Only add form context if the child is a field.
      if (child.props) {
        child.props._formContext = formContext;
        // Add field name to an ordered field list used for tabbing and
        // getting the first message.
        if (child.props.name) {
          fieldNames.push(child.props.name);
        }
      }
    });

    this.fieldNames = fieldNames;
    this.focusedField = this.fieldNames[0];

    return <form onKeyDown={this.handleKeyDown}>{this.props.children}</form>;
  }
});

module.exports = Form;
