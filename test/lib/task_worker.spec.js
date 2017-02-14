'use strict';

const Helpers = require('../helpers')
const chai = require('chai')

const { expect } = chai

const { TaskWorker, serverNow, serverOffset, nonPlainObjects, nonStringsWithoutNull, withTasksRef, pushTasks, chain } = new Helpers()

const SERVER_TIMESTAMP = {'.sv': 'timestamp'}

describe('TaskWorker', () => {

  describe('#reset', () => {

    it('should not reset a task that no longer exists and explicitly return null', () => {
      const tw = new TaskWorker({ spec: {} })
      const result = tw.reset(null)
      expect(result).to.be.null
    })

    it('should reset a task that is currently in progress and owned by the TaskWorker', () => {
      const spec = { inProgressState: 'inProgress', startState: 'start' }
      const tw = new TaskWorker({ owner: 'owner', spec })

      const result = tw.reset({ 
        _state: spec.inProgressState,
        _owner: 'owner',
        _progress: 10,
        _state_changed: 1,
        _error_details: {},
        prop: 'value'
      })

      expect(result).to.deep.equal({
        _state: spec.startState,
        _owner: null,
        _progress: null,
        _state_changed: SERVER_TIMESTAMP,
        _error_details: null,
        prop: 'value'
      })

      expect(result).to.have.property('_state').that.equals(spec.startState)
      expect(result).to.have.property('_owner').that.is.null
      expect(result).to.have.property('_progress').that.is.null
      expect(result).to.have.property('_state_changed').that.deep.equals(SERVER_TIMESTAMP)
      expect(result).to.have.property('_error_details').that.is.null
      expect(result).to.have.property('prop').that.equals('value')
    })

    it('should not reset a task that is not owned by the TaskWorker', () => {
      const tw = new TaskWorker({ owner: 'us', spec: {} })
      const result = tw.reset({ _owner: 'them' })
      expect(result).to.be.undefined
    })

    it('should not reset a task if it is not in progress', () => {
      const tw = new TaskWorker({ owner: 'owner', spec: { inProgressState: 'inProgress'} })
      const result = tw.reset({ _owner: 'owner', _state: 'notInProgress' })
      expect(result).to.be.undefined
    })

    it('should not reset a task if it has no state', () => {
      const tw = new TaskWorker({ owner: 'owner', spec: { inProgressState: 'inProgress'} })
      const result = tw.reset({ _owner: 'owner' })
      expect(result).to.be.undefined
    })
    
  })

  describe('#resetIfTimedOut', () => {
    it('should not reset a task that no longer exists and explicitly return null', () => {
      const tw = new TaskWorker({ spec: {} })
      const result = tw.resetIfTimedOut(null)
      expect(result).to.be.null
    })

    it('should reset a task that is currently in progress that has timed out', () => {
      const spec = { inProgressState: 'inProgress', startState: 'start', timeout: 1000 }
      const tw = new TaskWorker({ serverOffset, spec })
      const result = tw.resetIfTimedOut({ 
        _state: spec.inProgressState,
        _owner: 'owner',
        _progress: 10,
        _state_changed: serverNow() - spec.timeout,
        _error_details: {},
        prop: 'value'
      })

      expect(result).to.have.property('_state').that.equals(spec.startState)
      expect(result).to.have.property('_owner').that.is.null
      expect(result).to.have.property('_progress').that.is.null
      expect(result).to.have.property('_state_changed').that.deep.equals(SERVER_TIMESTAMP)
      expect(result).to.have.property('_error_details').that.is.null
      expect(result).to.have.property('prop').that.equals('value')
    })

    it('should not reset a task if it is not in progress', () => {
      const spec = { inProgressState: 'inProgress', timeout: 1000 }
      const tw = new TaskWorker({ serverOffset, spec })
      const result = tw.resetIfTimedOut({ _state: 'notInProgress', _state_changed: serverNow() - spec.timeout })
      expect(result).to.be.undefined
    })

    it('should not reset a task if it has no state', () => {
      const spec = { inProgressState: 'inProgress', timeout: 1000 }
      const tw = new TaskWorker({ serverOffset, spec })
      const result = tw.resetIfTimedOut({ _state_changed: serverNow() - spec.timeout })
      expect(result).to.be.undefined
    })

    it('should not reset a task if it is has changed state recently', () => {
      const spec = { inProgressState: 'inProgress', timeout: 1000 }
      const tw = new TaskWorker({ serverOffset, spec })
      const result = tw.resetIfTimedOut({ _state: spec.inProgressState, _state_changed: serverNow() })
      expect(result).to.be.undefined
    })
  })

  describe('#resolveWith', () => {

    function basicResolveResult({ state }) {
      return {
        _progress: 100,
        _state: state,
        _state_changed: SERVER_TIMESTAMP,
        _error_details: null,
        _owner: null
      }
    }

    it('should not resolve a task that no longer exists and explicitly return null', () => {
      const tw = new TaskWorker({ spec: {} })
      const result = tw.resolveWith(undefined)(null)
      expect(result).to.be.null
    })

    it('should resolve a task in progress and owned by the current worker and remove it when no finishedState is specified', () => {
      const spec = { inProgressState: 'inProgress' }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.resolveWith(undefined)({ _owner: 'owner', _state: spec.inProgressState })
      expect(result).to.be.null
    })

    it('should resolve a task owned by the current worker and change the state when a finishedState is specified and no object passed', () => {
      const spec = { inProgressState: 'inProgress', finishedState: 'finished' }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.resolveWith(undefined)({ _owner: 'owner', _state: spec.inProgressState, _error_details: {} })

      expect(result).to.deep.equal(basicResolveResult({ state: spec.finishedState }))
    })


    nonPlainObjects.forEach(nonPlainObject =>
      it('should resolve an task owned by the current worker and change the state when a finishedState is specified and an invalid object ' + nonPlainObject + ' passed', () => {
        const spec = { inProgressState: 'inProgress', finishedState: 'finished' }
        const tw = new TaskWorker({ owner: 'owner', spec })
        const result = tw.resolveWith(nonPlainObject)({ _state: spec.inProgressState, _owner: 'owner' })

        expect(result).to.deep.equal(basicResolveResult({ state: spec.finishedState }))
      })
    )

    it('should resolve a task owned by the current worker and change the state when a finishedState is specified and a plain object passed', () => {
      const spec = { inProgressState: 'inProgress', finishedState: 'finished' }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const newTask = { foo: 'bar' }
      const result = tw.resolveWith(newTask)({ _state: spec.inProgressState, _owner: 'owner' })

      const expected = basicResolveResult({ state: spec.finishedState })
      expected.foo = 'bar'

      expect(result).to.deep.equal(expected)

      expect(newTask).to.deep.equal({ foo: 'bar' })
    })

    it('should resolve a task owned by the current worker and change the state to a provided valid string _new_state', () => {
      const spec = { inProgressState: 'inProgress', finishedState: 'finished' }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.resolveWith({ foo: 'bar', _new_state: 'valid_new_state' })({ _state: spec.inProgressState, _owner: 'owner' })

      const expected = basicResolveResult({ state: 'valid_new_state' })
      expected.foo = 'bar'

      expect(result).to.deep.equal(expected)
    })

    it('should resolve a task owned by the current worker and change the state to a provided valid null _new_state for a spec with finishedState', () => {
      const spec = { inProgressState: 'inProgress', finishedState: 'finished' }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.resolveWith({ foo: 'bar', _new_state: null })({ _state: spec.inProgressState, _owner: 'owner' })

      const expected = basicResolveResult({ state: null })
      expected.foo = 'bar'

      expect(result).to.deep.equal(expected)
    })

    it('should resolve a task owned by the current worker and change the state to a provided valid null _new_state for a spec without finishedState', () => {
      const spec = { inProgressState: 'inProgress' }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.resolveWith({ foo: 'bar', _new_state: null })({ _state: spec.inProgressState, _owner: 'owner' })

      const expected = basicResolveResult({ state: null })
      expected.foo = 'bar'

      expect(result).to.deep.equal(expected)
    })

    it('should resolve a task owned by the current worker and remove the task when provided _new_state = false', () => {
      const spec = { inProgressState: 'inProgress', finishedState: 'finished' }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.resolveWith({ foo: 'bar', _new_state: false })({ _state: spec.inProgressState, _owner: 'owner' })

      expect(result).to.be.null
    })

    it('should resolve a task owned by the current worker and change the state to finishedState when provided an invalid _new_state', () => {
      const spec = { inProgressState: 'inProgress', finishedState: 'finished' }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.resolveWith({ foo: 'bar', _new_state: { state: 'object_is_an_invalid_new_state' } })({ _state: spec.inProgressState, _owner: 'owner' })

      const expected = basicResolveResult({ state: spec.finishedState })
      expected.foo = 'bar'

      expect(result).to.deep.equal(expected)
    })

    it('should resolve a task owned by the current worker and remove the task when provided an invalid _new_state when finishedState is absent', () => {
      const spec = { inProgressState: 'inProgress' }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.resolveWith({ foo: 'bar', _new_state: { state: 'object_is_an_invalid_new_state' } })({ _state: spec.inProgressState, _owner: 'owner' })

      expect(result).to.be.null
    })

    it('should not resolve a task if it is no longer owned by the current worker', () => {
      const spec = { inProgressState: 'inProgress', finishedState: 'finished' }
      const tw = new TaskWorker({ owner: 'us', spec })
      const result = tw.resolveWith({ foo: 'bar' })({ _state: spec.inProgressState, _owner: 'them' })
      expect(result).to.be.undefined
    })

    it('should not resolve a task if it is no longer owned by the current worker and if it would otherwise be deleted', () => {
      const spec = { inProgressState: 'inProgress' }
      const tw = new TaskWorker({ owner: 'us', spec })
      const result = tw.resolveWith({ foo: 'bar' })({ _state: spec.inProgressState, _owner: 'them' })
      expect(result).to.be.undefined
    })

    it('should not resolve a task if it is not in progress', () => {
      const tw = new TaskWorker({ owner: 'owner', spec: { inProgressState: 'inProgress' } })
      const result = tw.resolveWith({ foo: 'bar' })({ _state: 'notInProgress', _owner: 'owner' })
      expect(result).to.be.undefined
    })

    it('should not resolve a task if it is has no state', () => {
      const tw = new TaskWorker({ owner: 'owner', spec: { inProgressState: 'inProgress' } })
      const result = tw.resolveWith({ foo: 'bar' })({ _owner: 'owner' })
      expect(result).to.be.undefined
    })
  })

  describe('#rejectWith', () => {

    function baseRejectResult({ state, previousState }) {
      return {
        _owner: null,
        _state: state,
        _state_changed: SERVER_TIMESTAMP,
        _error_details: {
          previous_state: previousState,
          attempts: 1,
          error: null,
          error_stack: null
        }
      }
    }

    it('should not reject a task that no longer exists and explicitly return null', () => {
      const tw = new TaskWorker({ spec: {} })
      const result = tw.rejectWith(null, null)(null)
      expect(result).to.be.null
    })

    it('should reject a task owned by the current worker', () => {
      const spec = { inProgressState: 'inProgress', errorState: 'error', retries: 0 }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.rejectWith(null, null)({ _state: spec.inProgressState, _owner: 'owner', foo: 'bar' })

      const expected = baseRejectResult({ state: spec.errorState, previousState: spec.inProgressState })
      expected.foo = 'bar'

      expect(result).to.deep.equal(expected)
    })

    it('should reject a task owned by the current worker and increase the attempts if this is not the first attempt', () => {
      const spec = { inProgressState: 'inProgress', errorState: 'error', retries: 1 }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.rejectWith(null, null)({
        _state: spec.inProgressState,
        _owner: 'owner',
        _error_details: {
          previous_state: spec.inProgressState,
          attempts: 1
        },
        foo: 'bar'
      })

      const expected = baseRejectResult({ state: spec.errorState, previousState: spec.inProgressState })
      expected.foo = 'bar'
      expected._error_details.attempts = 2

      expect(result).to.deep.equal(expected)
    })

    it('should reject a task owned by the current worker and reset if more retries are specified', () => {
      const spec = { startState: 'start', inProgressState: 'inProgress', errorState: 'error', retries: 4 }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.rejectWith(null, null)({
        _state: spec.inProgressState,
        _owner: 'owner',
        _error_details: {
          previous_state: spec.inProgressState,
          attempts: 1
        },
        foo: 'bar'
      })

      const expected = baseRejectResult({ state: spec.startState, previousState: spec.inProgressState })
      expected.foo = 'bar'
      expected._error_details.attempts = 2

      expect(result).to.deep.equal(expected)
    })

    it('should reject a task owned by the current worker and reset the attempts count if chaining error handlers', () => {
      const spec = { startState: 'start', inProgressState: 'inProgress', errorState: 'error', retries: 4 }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.rejectWith(null, null)({
        _state: spec.inProgressState,
        _owner: 'owner',
        _error_details: {
          previous_state: 'other_in_progress_state',
          attempts: 1
        },
        foo: 'bar'
      })

      const expected = baseRejectResult({ state: spec.startState, previousState: spec.inProgressState })
      expected.foo = 'bar'
      expected._error_details.attempts = 1

      expect(result).to.deep.equal(expected)
    })

    it('should reject a task owned by the current worker and append the error string to the _error_details', () => {
      const error = 'My error message'

      const spec = { inProgressState: 'inProgress', errorState: 'error', retries: 0 }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.rejectWith(error, null)({ _state: spec.inProgressState, _owner: 'owner', foo: 'bar' })

      const expected = baseRejectResult({ state: spec.errorState, previousState: spec.inProgressState })
      expected.foo = 'bar'
      expected._error_details.error = error

      expect(result).to.deep.equal(expected)
    })

    it('should reject a task owned by the current worker and append the error string and stack to the _error_details', () => {
      const { message, stack } = new Error('My error message')

      const spec = { inProgressState: 'inProgress', errorState: 'error', retries: 0 }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.rejectWith(message, stack)({ _state: spec.inProgressState, _owner: 'owner', foo: 'bar' })

      const expected = baseRejectResult({ state: spec.errorState, previousState: spec.inProgressState })
      expected.foo = 'bar'
      expected._error_details.error = message
      expected._error_details.error_stack = stack

      expect(result).to.deep.equal(expected)
    })

    it('should not reject a task if it is no longer owned by the current worker', () => {
      const spec = { inProgressState: 'inProgress' }
      const tw = new TaskWorker({ owner: 'us', spec })
      const result = tw.rejectWith(null, null)({ _state: spec.inProgressState, _owner: 'them' })

      expect(result).to.be.undefined
    })

    it('should not reject a task if it is not in progress', () => {
      const tw = new TaskWorker({ owner: 'owner', spec: { inProgressState: 'inProgress' } })
      const result = tw.rejectWith(null, null)({ _state: 'notInProgress', _owner: 'owner' })

      expect(result).to.be.undefined
    })

    it('should not reject a task if it is has no state', () => {
      const tw = new TaskWorker({ owner: 'owner', spec: { inProgressState: 'inProgress' } })
      const result = tw.rejectWith(null, null)({ _owner: 'owner' })

      expect(result).to.be.undefined
    })
  })

  describe('#updateProgressWith', () => {

    it('should not update the progress a task that no longer exists and explicitly return null', () => {
      const tw = new TaskWorker({ spec: {} })
      const result = tw.updateProgressWith(10)(null)
      expect(result).to.be.null
    })

    it('should not update the progress of a task no longer owned by the current worker', () => {
      const tw = new TaskWorker({ owner: 'us', spec: { inProgressState: 'inProgress' } })
      const result = tw.updateProgressWith(10)({ _owner: 'them' })

      expect(result).to.be.undefined
    })

    it('should not update the progress of a task if the task is no longer in progress', () => {
      const tw = new TaskWorker({ owner: 'owner', spec: { inProgressState: 'inProgress' } })
      const result = tw.updateProgressWith(10)({ _owner: 'owner', _state: 'notInProgress' })

      expect(result).to.be.undefined
    })

    it('should not update the progress of a task if the task has no _state', () => {
      const tw = new TaskWorker({ owner: 'owner', spec: { inProgressState: 'inProgress' } })
      const result = tw.updateProgressWith(10)({ _owner: 'owner' })

      expect(result).to.be.undefined
    })

    it('should update the progress of the current task', () => {
      const spec = { inProgressState: 'inProgress' }
      const tw = new TaskWorker({ owner: 'owner', spec })
      const result = tw.updateProgressWith(10)({ _owner: 'owner', _state: spec.inProgressState, foo: 'bar' })

      expect(result).to.deep.equal({
        _owner: 'owner',
        _state: spec.inProgressState,
        _progress: 10,
        foo: 'bar'
      })
    })
  })

  describe('#claimFor', () => {

    it('should not claim a task that no longer exists and explicitly return null', () => {
      const tw = new TaskWorker({ spec: {} })
      const result = tw.claimFor(undefined)(null)
      expect(result).to.be.null
    })

    it('should claim a task without a _state if the startState is null', () => {
      const spec = { startState: null, inProgressState: 'inProgress' }
      const tw = new TaskWorker({ spec })
      const result = tw.claimFor(() => 'owner')({ foo: 'bar' })
      expect(result).to.deep.equal({
        _state: spec.inProgressState,
        _state_changed: SERVER_TIMESTAMP,
        _owner: 'owner',
        _progress: 0,
        foo: 'bar'
      })
    })

    it('should claim a task with the _state set to the startState', () => {
      const spec = { startState: 'start', inProgressState: 'inProgress' }
      const tw = new TaskWorker({ spec })
      const result = tw.claimFor(() => 'owner')({ foo: 'bar', _state: spec.startState })
      expect(result).to.deep.equal({
        _state: spec.inProgressState,
        _state_changed: SERVER_TIMESTAMP,
        _owner: 'owner',
        _progress: 0,
        foo: 'bar'
      })
    })

    it('should not claim a task if not a plain object', () => {
      const spec = { errorState: 'error' }
      const tw = new TaskWorker({ spec })
      const result = tw.claimFor(undefined)('invalid')
      expect(result).to.deep.equal({
        _state: spec.errorState,
        _state_changed: SERVER_TIMESTAMP,
        _error_details: {
          error: 'Task was malformed',
          original_task: 'invalid'
        }
      })
    })

    it('should not claim a task if no longer in correct startState', () => {
      const spec = { startState: null }
      const tw = new TaskWorker({ spec })
      const result = tw.claimFor(undefined)({ foo: 'bar', _state: 'inProgress' })
      expect(result).to.be.undefined
    })
  })

  describe('#getInProgressFrom', () => {

    it('should select only tasks in progress', () =>
      withTasksRef(tasksRef => {
        const spec = { inProgressState: '2.inProgress' }
        const tw = new TaskWorker({ spec })
        const [t1, t2, t3, t4] = [
          { id: 1, _state: '1.other' },
          { id: 2, _state: spec.inProgressState },
          { id: 3, _state: spec.inProgressState },
          { id: 4, _state: '3.other' }
        ]
        return chain(
          pushTasks(tasksRef, t1, t2, t3, t4),
          _ => tw.getInProgressFrom(tasksRef).once('value'),
          snapshot => {
            const result = []
            snapshot.forEach(x => { result.push(x.val()) })
            return result
          },
          result => {
            expect(result).to.have.a.lengthOf(2)
            expect(result).to.deep.equal([t2, t3])
          }
        )
      })
    )
  })

  describe('#getNextFrom', () => {

    function getNext(spec, tasks) {
      const tw = new TaskWorker({ spec })
      return withTasksRef(tasksRef =>
        chain(
          pushTasks(tasksRef, ...tasks),
          _ => tw.getNextFrom(tasksRef).once('value'),
          snapshot => {
            const result = []
            snapshot.forEach(x => { result.push(x.val()) })
            return result
          }
        )
      )
    }

    it('should select a single task in start state', () => {
      const spec = { startState: '2.start' }
      const tasks = [
        { id: 1, _state: '1.other' },
        { id: 2, _state: spec.startState },
        { id: 3, _state: spec.startState },
        { id: 4, _state: '3.other' }
      ]
      const [t1, t2, t3, t4] = tasks

      return chain(
        getNext(spec, tasks),
        result => {
          expect(result).to.have.a.lengthOf(1)
          expect(result).to.deep.equal([t2])
        }
      )
    })

    it('should select a single task in start state if start state is null', () => {
      const spec = { startState: null }
      const tasks = [
        { id: 1, _state: '1.other' },
        { id: 2 },
        { id: 3 },
        { id: 4, _state: '3.other' }
      ]
      const [t1, t2, t3, t4] = tasks

      return chain(
        getNext(spec, tasks),
        result => {
          expect(result).to.have.a.lengthOf(1)
          expect(result).to.deep.equal([t2])
        }
      )
    })
  })
})
