'use strict';

const _ = require('lodash')
const Helpers = require('../helpers')
const chai = require('chai')
const sinon = require('sinon')

chai
  .use(require('sinon-chai'))
  .use(require('chai-as-promised'))
  .should()

const { expect } = chai

const th = new Helpers()
const { now, serverNow, allways, sideEffect, withTasksRef, withTestRefFor, withQueueWorkerFor, validBasicTaskSpec, validTaskSpecWithFinishedState, chain, pushTasks, waitForState, waitForStates, echo, nonPlainObjects, nonStrings, nonStringsWithoutNull } = th
const tasksRef = th.tasksRef
const _tasksRef = tasksRef

const nonBooleans             = ['', 'foo', NaN, Infinity,              0, 1, ['foo', 'bar'], { foo: 'bar' }, null,            { foo: { bar: { baz: true } } }, _.noop                ]
const nonFunctions            = ['', 'foo', NaN, Infinity, true, false, 0, 1, ['foo', 'bar'], { foo: 'bar' }, null,            { foo: { bar: { baz: true } } }                        ]
const nonPositiveIntegers     = ['', 'foo', NaN, Infinity, true, false, 0,    ['foo', 'bar'], { foo: 'bar' },                  { foo: { bar: { baz: true } } }, _.noop, -1, 1.1       ]
const invalidPercentageValues = ['', 'foo', NaN, Infinity, true, false,       ['foo', 'bar'], { foo: 'bar' },                  { foo: { bar: { baz: true } } }, _.noop, -1,      100.1]
const invalidTaskSpecs        = ['', 'foo', NaN, Infinity, true, false, 0, 1, ['foo', 'bar'], { foo: 'bar' }, null, undefined, { foo: { bar: { baz: true } } }, _.noop, -1            ]

const nonPositiveIntegersWithout0 = nonPositiveIntegers.filter(x => x !== 0)

describe('QueueWorker', () => {
  
  describe('initialize', () => {

    function initialize({ tasksRef = _tasksRef, processId = '0', sanitize = true, suppressStack = false, processingFunction = _.noop } = {}) {
      return new th.QueueWorker(tasksRef, processId, sanitize, suppressStack, processingFunction)
    }

    // we should probably replace the `throws(strings)` with `throws(CONSTANT)`

    it('should not create a QueueWorker with no parameters', () => 
      expect(() => new th.QueueWorker()).to.throw('No tasks reference provided.')
    )

    it('should not create a QueueWorker with only a tasksRef', () =>
      expect(() => new th.QueueWorker(tasksRef)).to.throw('Invalid process ID provided.')
    )

    it('should not create a QueueWorker with only a tasksRef, process ID, sanitize and suppressStack option', () =>
      expect(() => new th.QueueWorker(tasksRef, '0', true, false)).to.throw('No processing function provided.')
    )

    it('should not create a QueueWorker with a tasksRef, processId, sanitize option and an invalid processing function', () => 
      nonFunctions.forEach(nonFunctionObject =>
        expect(() => initialize({ processingFunction: nonFunctionObject })).to.throw('No processing function provided.')
      )
    )

    it('should create a QueueWorker with a tasksRef, processId, sanitize option and a processing function', () =>
      expect(() => initialize()).to.not.throw(Error)
    )

    it('should not create a QueueWorker with a non-string processId specified', () => 
      nonStrings.forEach(nonStringObject =>
        expect(() => initialize({ processId: nonStringObject })).to.throw('Invalid process ID provided.')
      )
    )

    it('should not create a QueueWorker with a non-boolean sanitize option specified', () =>
      nonBooleans.forEach(nonBooleanObject =>
        expect(() => initialize({ sanitize: nonBooleanObject })).to.throw('Invalid sanitize option.')
      )
    )

    it('should not create a QueueWorker with a non-boolean suppressStack option specified', () =>
      nonBooleans.forEach(nonBooleanObject =>
        expect(() => initialize({ suppressStack: nonBooleanObject })).to.throw('Invalid suppressStack option.')
      )
    )
  })

  describe('# Resetting tasks', () => {

    it('should reset a task when another task is currently being processed', () =>
      withTasksRef(tasksRef => 
        withQueueWorkerFor({ tasksRef }, qw => {
          qw.setTaskSpec(validTaskSpecWithFinishedState)
          const { startState, inProgressState, finishedState } = validTaskSpecWithFinishedState
          return chain(
            pushTasks(tasksRef, { task: 1 }, { task: 2 }),
            ([task1, task2]) => waitForState([task1, task2], inProgressState),
            ([_, task2]) => waitForState(task2, startState),
            task2 => {
              const task = task2.val()
              expect(task).to.not.have.any.keys('_owner', '_progress', '_state')
              expect(task).to.have.property('task').that.equals(2)
              expect(task).to.have.property('_state_changed').that.is.closeTo(serverNow(), 250)
            }
          )
        })
      )
    )
  })

  describe('#_resetTask', () => {

    it('should use TaskWorker in the transaction', () => 
      withTasksRef(tasksRef => {
        const tasks = []
        function TaskWorker() {
          this.hasTimeout = () => false
          this.reset = task => (tasks.push(task), task)
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          const task = { foo: 'bar' }
          return withTestRefFor(tasksRef, testRef =>
            testRef.set(task)
              .then(_ => qw._resetTask(testRef))
              .then(_ => {
                expect(tasks).to.deep.equal([null, task])
              })
          )
        })
      })
    )

    it.skip('should correctly handle transaction retries', () => {})
  })

  describe('#_resetTaskIfTimedOut', () => {

    it('should use TaskWorker in the transaction', () => 
      withTasksRef(tasksRef => {
        const tasks = []
        function TaskWorker() {
          this.hasTimeout = () => false
          this.resetIfTimedOut = task => (tasks.push(task), task)
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          const task = { foo: 'bar' }
          return withTestRefFor(tasksRef, testRef =>
            testRef.set(task)
              .then(_ => qw._resetTaskIfTimedOut(testRef))
              .then(_ => {
                expect(tasks).to.deep.equal([null, task])
              })
          )
        })
      })
    )

    it.skip('should correctly handle transaction retries', () => {})
  })

  describe('#_resolve', () => {
    
    it('should use TaskWorker in the transaction', () => 
      withTasksRef(tasksRef => {
        const tasks = []
        function TaskWorker() {
          this.hasTimeout = () => false
          this.resolveWith = newTask => task => (tasks.push([newTask, task]), task)
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          const task = { foo: 'bar' }
          const newTask = { baz: 'qux' }
          return withTestRefFor(tasksRef, testRef =>
            testRef.set(task)
              .then(_ => qw._resolve(testRef, qw._taskNumber())[0](newTask))
              .then(_ => {
                expect(tasks).to.deep.equal([[newTask, null], [newTask, task]])
              })
          )
        })
      })
    )

    it.skip('should correctly handle transaction retries', () => {})

    it('should not call the task worker if a new task is being processed', () =>
      withTasksRef(tasksRef => {
        const tasks = []
        function TaskWorker() {
          this.hasTimeout = () => false
          this.resolveWith = newTask => task => (tasks.push([newTask, task]), task)
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          return withTestRefFor(tasksRef, testRef =>
            testRef.set({ foo: 'bar' })
              .then(_ => qw._resolve(testRef, qw._taskNumber() + 1)[0]({ baz: 'qux' }))
              .then(_ => {
                expect(tasks).to.deep.equal([])
              })
          )
        })
      })
    )
  })

  describe('#_reject', () => {

    it('should use TaskWorker in the transaction', () => 
      withTasksRef(tasksRef => {
        const tasks = []
        function TaskWorker() {
          this.hasTimeout = () => false
          this.rejectWith = (error, stack) => task => (tasks.push([error, stack, task]), task)
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          const task = { foo: 'bar' }
          const error = new Error('test error')
          const { message, stack } = error
          return withTestRefFor(tasksRef, testRef =>
            testRef.set(task)
              .then(_ => qw._reject(testRef, qw._taskNumber())[0](error))
              .then(_ => {
                expect(tasks).to.deep.equal([[message, stack, null], [message, stack, task]])
              })
          )
        })
      })
    )

    it.skip('should correctly handle transaction retries', () => {})

    nonStringsWithoutNull.forEach(nonStringObject =>
      it('should reject a task owned by the current worker and convert the error to a string if not a string: ' + nonStringObject, () =>
        withTasksRef(tasksRef => {
          const tasks = []
          function TaskWorker() {
            this.hasTimeout = () => false
            this.rejectWith = (error, stack) => task => (tasks.push([error, stack, task]), task)
          }

          return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
            qw._setTaskSpec(th.validBasicTaskSpec)
            const task = { foo: 'bar' }
            return withTestRefFor(tasksRef, testRef =>
              testRef.set(task)
                .then(_ => qw._reject(testRef, qw._taskNumber())[0](nonStringObject))
                .then(_ => {
                  expect(tasks).to.deep.equal([[nonStringObject.toString(), null, null], [nonStringObject.toString(), null, task]])
                })
            )
          })
        })
      )
    )

    it('should reject a task owned by the current worker and append the error string to the _error_details', () =>
      withTasksRef(tasksRef => {
        const tasks = []
        function TaskWorker() {
          this.hasTimeout = () => false
          this.rejectWith = (error, stack) => task => (tasks.push([error, stack, task]), task)
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          const task = { foo: 'bar' }
          const error = 'My error message'
          return withTestRefFor(tasksRef, testRef =>
            testRef.set(task)
              .then(_ => qw._reject(testRef, qw._taskNumber())[0](error))
              .then(_ => {
                expect(tasks).to.deep.equal([[error, null, null], [error, null, task]])
              })
          )
        })
      })
    )

    it('should reject a task owned by the current worker and append only the error string to the _error_details if suppressStack is set to true', () =>
      withTasksRef(tasksRef => {
        const tasks = []
        function TaskWorker() {
          this.hasTimeout = () => false
          this.rejectWith = (error, stack) => task => (tasks.push([error, stack, task]), task)
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker, suppressStack: true }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          const task = { foo: 'bar' }
          const error = new Error('test error')
          return withTestRefFor(tasksRef, testRef =>
            testRef.set(task)
              .then(_ => qw._reject(testRef, qw._taskNumber())[0](error))
              .then(_ => {
                expect(tasks).to.deep.equal([[error.message, null, null], [error.message, null, task]])
              })
          )
        })
      })
    )

    it('should not call the task worker if a new task is being processed', () =>
      withTasksRef(tasksRef => {
        const tasks = []
        function TaskWorker() {
          this.hasTimeout = () => false
          this.rejectWith = (error, stack) => task => (tasks.push([error, stack, task]), task)
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          return withTestRefFor(tasksRef, testRef =>
            testRef.set({ foo: 'bar' })
              .then(_ => qw._reject(testRef, qw._taskNumber() + 1)[0](null))
              .then(_ => {
                expect(tasks).to.deep.equal([])
              })
          )
        })
      })
    )
  })

  describe('#_updateProgress', () => {

    it('should use TaskWorker in the transaction', () =>
      withTasksRef(tasksRef => {
        const tasks = []
        function TaskWorker() {
          this.hasTimeout = () => false
          this.updateProgressWith = progress => task => (tasks.push([progress, task]), task)
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          const task = { foo: 'bar' }
          return withTestRefFor(tasksRef, testRef =>
            testRef.set(task)
              .then(_ => qw._updateProgress(testRef, qw._taskNumber())(1))
              .then(_ => {
                expect(tasks).to.deep.equal([[1, null], [1, task]])
              })
          )
        })
      })
    )

    invalidPercentageValues.forEach(invalidPercentageValue => 
      it('should ignore invalid input ' + invalidPercentageValue + ' to update the progress', () =>
        withQueueWorkerFor({ tasksRef: {} }, qw =>
          qw._updateProgress(null, null)(invalidPercentageValue).should.eventually.be.rejectedWith('Invalid progress')
        )
      )
    )

    it('should not update the progress of a task no longer owned by the current worker', () =>
      withTasksRef(tasksRef => {

        function TaskWorker() {
          this.hasTimeout = () => false
          this.updateProgressWith = progress => task => undefined
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)

          return withTestRefFor(tasksRef, testRef =>
            testRef.set({})
              .then(_ => qw._updateProgress(testRef, qw._taskNumber())(1))
              .should.eventually.be.rejectedWith('Can\'t update progress - current task no longer owned by this process')
          )
        })
      })
    )

    it('should not update the progress of a task if a new task is being processed', () =>
      withTasksRef(tasksRef =>
        withQueueWorkerFor({ tasksRef, TaskWorker: function() { this.hasTimeout = () => false } }, qw =>
          qw._updateProgress(null, qw._taskNumber() + 1)(1)
            .should.eventually.be.rejectedWith('Can\'t update progress - no task currently being processed')
        )
      )
    )

    it('should not call the task worker if a new task is being processed', () =>
      withTasksRef(tasksRef => {
        const tasks = []
        function TaskWorker() {
          this.hasTimeout = () => false
          this.updateProgressWith = progress => task => (tasks.push([progress, task]), task)
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          return withTestRefFor(tasksRef, testRef =>
            testRef.set({ foo: 'bar' })
              .then(_ => qw._updateProgress(testRef, qw._taskNumber() + 1)(1).catch(_ => undefined))
              .then(_ => {
                expect(tasks).to.deep.equal([])
              })
          )
        })
      })
    )
  })

  describe('#_tryToProcess', () => {

    /*
      Most of the specs here have extensive knowledge of the inner 
      workings of tryToProcess. We have to eventually fix that
    */

    it('should not try and process a task if busy', () => 
      withTasksRef(tasksRef => {
        const tasks = []
        function TaskWorker() {
          this.hasTimeout = () => false
          this.claimFor = getOwner => task => (tasks.push([getOwner, task]), null)
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          qw._busy(true)
          qw._newTaskRef(tasksRef)
          const task = { foo: 'bar' }
          return withTestRefFor(tasksRef, testRef =>
            testRef.set(task)
              .then(_ => qw._tryToProcess())
              .then(_ => {
                expect(qw._currentTaskRef()).to.be.null
                qw._busy(false)
              })
          )
        })
      })
    )
    
    it('should use TaskWorker in the transaction', () =>
      withTasksRef(tasksRef => {
        const tasks = []
        function TaskWorker() {
          this.hasTimeout = () => false
          this.claimFor = getOwner => task => (tasks.push([getOwner, task]), null)
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          qw._newTaskRef(tasksRef)
          const task = { foo: 'bar' }
          return withTestRefFor(tasksRef, testRef =>
            testRef.set(task)
              .then(_ => qw._tryToProcess())
              .then(_ => {
                expect(tasks).to.have.a.lengthOf(2)
                expect(tasks).to.have.deep.property('[0]').that.is.an.array
                expect(tasks).to.have.deep.property('[1]').that.is.an.array
                const [[f1, task1], [f2, task2]] = tasks
                expect(f1).to.equal(f2)
                expect(f1().startsWith('0:')).to.be.true
                expect(f1().endsWith(':1')).to.be.true
                expect(task1).to.be.null
                expect(task2).to.deep.equal(task)
              })
          )
        })
      })
    )

    it('should try and process a task if not busy, rejecting it if it throws', () => 
      withTasksRef(tasksRef => {
        const error = new Error('Error thrown in processingFunction')
        function TaskWorker() {
          this.cloneWithOwner = _ => new TaskWorker()
          this.getOwnerRef = ref => ref
          this.hasTimeout = () => false
          this.isInErrorState = _ => false
          this.rejectWith = (message, stack) => task => ({ foo: null, message, stack })
          this.claimFor = getOwner => task => (task && task.foo && task) 
        }
        function processFunction() { throw error }

        return withQueueWorkerFor({ tasksRef, TaskWorker, processFunction, sanitize: false }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          qw._newTaskRef(tasksRef)
          return withTestRefFor(tasksRef, testRef =>
            testRef.set({ foo: 'bar' })
              .then(_ => qw._tryToProcess())
              .then(_ => {
                expect(qw._currentTaskRef()).to.not.be.null
                expect(qw._busy()).to.be.true
              })
              .then(_ => testRef.once('child_removed'))
              .then(_ => testRef.once('value'))
              .then(snapshot => {
                expect(snapshot.val()).to.deep.equal({ message: error.message, stack: error.stack })
              })
          )
        })
      })
    )

    it('should set busy and current task ref for a valid task', () => 
      withTasksRef(tasksRef => {
        function TaskWorker() {
          this.cloneWithOwner = _ => new TaskWorker()
          this.getOwnerRef = ref => ref
          this.hasTimeout = () => false
          this.isInErrorState = _ => false
          this.resolveWith = newTask => task => undefined
          this.claimFor = getOwner => task => task 
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker, sanitize: false }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          qw._newTaskRef(tasksRef)
          return withTestRefFor(tasksRef, testRef =>
            testRef.set({ foo: 'bar' })
              .then(_ => qw._tryToProcess())
              .then(_ => {
                expect(qw._currentTaskRef()).to.not.be.null
                expect(qw._busy()).to.be.true
              })
          )
        })
      })
    )

    it('should not set busy and current task ref for an invalid task', () => 
      withTasksRef(tasksRef => {
        function TaskWorker() {
          this.hasTimeout = () => false
          this.claimFor = getOwner => task => undefined
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          qw._newTaskRef(tasksRef)
          return withTestRefFor(tasksRef, testRef =>
            testRef.set({ foo: 'bar' })
              .then(_ => qw._tryToProcess())
              .then(_ => {
                expect(qw._currentTaskRef()).to.be.null
                expect(qw._busy()).to.be.false
              })
          )
        })
      })
    )
    
    it('should not set busy and current task ref for a deleted task', () => 
      withTasksRef(tasksRef => {
        function TaskWorker() {
          this.hasTimeout = () => false
          this.claimFor = getOwner => task => null
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          qw._newTaskRef(tasksRef)
          return withTestRefFor(tasksRef, testRef =>
            testRef.set({ foo: 'bar' })
              .then(_ => qw._tryToProcess())
              .then(_ => {
                expect(qw._currentTaskRef()).to.be.null
                expect(qw._busy()).to.be.false
              })
          )
        })
      })
    )

    it('should not try and process a task if no task to process', () => 
      withTasksRef(tasksRef => {
        const notCalled = true
        function TaskWorker() {
          this.hasTimeout = () => false
          this.claimFor = getOwner => task => (notCalled = false, 'task')
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          qw._newTaskRef(tasksRef)
          return qw._tryToProcess()
            .then(_ => {
              expect(notCalled).to.be.true
            })
        })
      })
    )

    it('should invalidate callbacks if another process times the task out', () => 
      withTasksRef(tasksRef => {
        function TaskWorker() {
          this.cloneWithOwner = _ => new TaskWorker()
          this.getOwnerRef = ref => ref
          this.hasTimeout = () => false
          this.isInErrorState = _ => false
          this.resolveWith = newTask => task => undefined
          this.claimFor = getOwner => task => task 
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker, sanitize: false }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          qw._newTaskRef(tasksRef)
          return withTestRefFor(tasksRef, testRef =>
            testRef.set({ foo: 'bar' })
              .then(_ => qw._tryToProcess())
              .then(_ => {
                expect(qw._currentTaskRef()).to.not.be.null
                expect(qw._busy()).to.be.true
              })
              .then(_ => testRef.update({ _owner: null }))
              .then(_ => {
                expect(qw._currentTaskRef()).to.be.null
              })
          )
        })
      })
    )

    it('should sanitize data passed to the processing function when specified', done => {
      withTasksRef(tasksRef => {
        const task = { foo: 'bar' }
        function TaskWorker() {
          this.cloneWithOwner = _ => new TaskWorker()
          this.sanitize = task => (delete task._owner, task)
          this.getOwnerRef = ref => ref
          this.hasTimeout = () => false
          this.isInErrorState = _ => false
          this.claimFor = getOwner => task => (task && { foo: task.foo, _owner: 'owner' } || task)
        }
        function processFunction(data) {
          try { expect(data).to.deep.equal(task); done() } catch (e) { done(e) }
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker, processFunction }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          qw._newTaskRef(tasksRef)
          return withTestRefFor(tasksRef, testRef =>
            testRef.set(task).then(_ => qw._tryToProcess())
          )
        })
      })
    })

    it('should not sanitize data passed to the processing function when specified', done => {
      withTasksRef(tasksRef => {
        const task = { foo: 'bar' }
        let id = null
        const queueTask = Object.assign({ _owner: 'owner' }, task)
        function TaskWorker() {
          this.cloneWithOwner = _ => new TaskWorker()
          this.getOwnerRef = ref => ref
          this.hasTimeout = () => false
          this.isInErrorState = _ => false
          this.claimFor = getOwner => task => queueTask
        }
        function processFunction(data) {
          try { 
            expect(data).to.deep.equal(Object.assign({ _id: id }, queueTask))
            done() 
          } catch (e) { done(e) }
        }

        return withQueueWorkerFor({ tasksRef, TaskWorker, processFunction, sanitize: false }, qw => {
          qw._setTaskSpec(th.validBasicTaskSpec)
          qw._newTaskRef(tasksRef)
          return withTestRefFor(tasksRef, testRef => {
            id = testRef.key
            return testRef.set(task).then(_ => qw._tryToProcess())
          })
        })
      })
    })
  })

  describe('#_setUpTimeouts', () => {
    let qw
    let clock
    let setTimeoutSpy
    let clearTimeoutSpy

    before(done => {
      // ensure firebase is up and running before we stop the clock 
      // at individual specs
      tasksRef.push().set(null).then(done)
    })

    beforeEach(() => {
      qw = new th.QueueWorkerWithoutProcessing(tasksRef, '0', true, false, _.noop)
      clock = sinon.useFakeTimers(now())
      setTimeoutSpy = sinon.spy(global, 'setTimeout')
      clearTimeoutSpy = sinon.spy(global, 'clearTimeout')
    })

    afterEach(done => {
      setTimeoutSpy.restore()
      clearTimeoutSpy.restore()
      clock.restore()
      qw.shutdown()
        .then(_ => tasksRef.set(null))
        .then(done)
    })

    it.skip('should use taskWorker to select tasks in progress', () => {})

    it('should not set up timeouts when no task timeout is set', () => {
      qw.setTaskSpec(th.validBasicTaskSpec)
      return tasksRef.push().set({
        '_state': th.validBasicTaskSpec.inProgressState,
        '_state_changed': now()
      }).then(_ => {
          expect(qw._expiryTimeouts).to.deep.equal({})
        })
    })

    it('should not set up timeouts when a task not in progress is added and a task timeout is set', () => {
      qw.setTaskSpec(th.validTaskSpecWithTimeout)
      return tasksRef.push({
        '_state': th.validTaskSpecWithFinishedState.finishedState,
        '_state_changed': now()
      }).then(_ => {
          expect(qw._expiryTimeouts).to.deep.equal({})
        })
    })

    it('should set up timeout listeners when a task timeout is set', () => {
      expect(qw._expiryTimeouts).to.deep.equal({})
      expect(qw._processingTasksRef()).to.be.null
      expect(qw._processingTaskAddedListener()).to.be.null
      expect(qw._processingTaskRemovedListener()).to.be.null

      qw.setTaskSpec(th.validTaskSpecWithTimeout)

      expect(qw._expiryTimeouts).to.deep.equal({})
      expect(qw._processingTasksRef()).to.not.be.null
      expect(qw._processingTaskAddedListener()).to.not.be.null
      expect(qw._processingTaskRemovedListener()).to.not.be.null
    })

    it('should remove timeout listeners when a task timeout is not specified after a previous task specified a timeout', () => {
      qw.setTaskSpec(th.validTaskSpecWithTimeout)

      expect(qw._expiryTimeouts).to.deep.equal({})
      expect(qw._processingTasksRef()).to.not.be.null
      expect(qw._processingTaskAddedListener()).to.not.be.null
      expect(qw._processingTaskRemovedListener()).to.not.be.null

      qw.setTaskSpec(th.validBasicTaskSpec)

      expect(qw._expiryTimeouts).to.deep.equal({})
      expect(qw._processingTasksRef()).to.be.null
      expect(qw._processingTaskAddedListener()).to.be.null
      expect(qw._processingTaskRemovedListener()).to.be.null
    })

    it('should set up a timeout when a task timeout is set and a task added', () => {
      qw.setTaskSpec(th.validTaskSpecWithTimeout);
      const testRef = tasksRef.push({
        '_state': th.validTaskSpecWithTimeout.inProgressState,
        '_state_changed': now() - 5
      })

      return testRef.then(_ => {
          expect(qw._expiryTimeouts).to.have.all.keys([testRef.key])
          expect(setTimeoutSpy.firstCall.args[1]).to.equal(th.validTaskSpecWithTimeout.timeout - 5)
        })
    })

    it('should set up a timeout when a task timeout is set and a task owner changed', () => {
      qw.setTaskSpec(th.validTaskSpecWithTimeout)
      const testRef = tasksRef.push({
        '_owner': qw._processId + ':0',
        '_state': th.validTaskSpecWithTimeout.inProgressState,
        '_state_changed': now() - 10
      })

      return testRef
        .then(_ => {
          expect(qw._expiryTimeouts).to.have.all.keys([testRef.key])
        })
        .then(_ => testRef.update({ '_owner': qw._processId + ':1', '_state_changed': now() - 5 }))
        .then(_ => {
          expect(qw._expiryTimeouts).to.have.all.keys([testRef.key])
          expect(setTimeoutSpy.lastCall.args[1]).to.equal(th.validTaskSpecWithTimeout.timeout - 5)
        })
    })

    it('should not set up a timeout when a task timeout is set and a task updated', () => {
      qw.setTaskSpec(th.validTaskSpecWithTimeout)

      const testRef = tasksRef.push({
        '_owner': qw._processId + ':0',
        '_progress': 0,
        '_state': th.validTaskSpecWithTimeout.inProgressState,
        '_state_changed': now() - 5
      })

      return testRef
        .then(_ => {
          expect(qw._expiryTimeouts).to.have.all.keys([testRef.key])
        })
        .then(_ => testRef.update({ '_progress': 1 }))
        .then(_ => {
          expect(qw._expiryTimeouts).to.have.all.keys([testRef.key])
          expect(setTimeoutSpy.firstCall.args[1]).to.equal(th.validTaskSpecWithTimeout.timeout - 5)
        })
    })

    it('should set up a timeout when a task timeout is set and a task added without a _state_changed time', () => {
      qw.setTaskSpec(th.validTaskSpecWithTimeout)

      const testRef = tasksRef.push({
        '_state': th.validTaskSpecWithTimeout.inProgressState
      })

      return testRef
        .then(_ => {
          expect(qw._expiryTimeouts).to.have.all.keys([testRef.key]);
          expect(setTimeoutSpy.firstCall.args[1]).to.equal(th.validTaskSpecWithTimeout.timeout);
        })
    })

    it('should clear timeouts when a task timeout is not set and a timeout exists', () => {
      qw.setTaskSpec(th.validTaskSpecWithTimeout)
      const testRef = tasksRef.push({
        '_state': th.validTaskSpecWithTimeout.inProgressState,
        '_state_changed': now()
      })

      return testRef
        .then(_ => {
          expect(qw._expiryTimeouts).to.have.all.keys([testRef.key])
          qw.setTaskSpec()
          expect(qw._expiryTimeouts).to.deep.equal({})
        })
    })

    it('should clear a timeout when a task is completed', () => {
      const taskSpec = _.clone(th.validTaskSpecWithTimeout)
      taskSpec.finishedState = th.validTaskSpecWithFinishedState.finishedState
      qw.setTaskSpec(taskSpec);

      const task = {
        '_state': taskSpec.inProgressState,
        '_state_changed': now()
      }

      const testRef = tasksRef.push()
      return testRef.set(task)
        .then(_ => testRef.update({ '_state': taskSpec.finishedState }))
        .then(_ => {
          expect(setTimeoutSpy.callCount).to.equal(1, 'setTimeout was not called')
          const clearId = setTimeoutSpy.firstCall.returnValue
          expect(clearTimeoutSpy.callCount).to.equal(1, 'clearTimeout was not called')
          expect(clearTimeoutSpy.firstCall.calledWith(clearId)).to.be.equal(true, 'clearTimeout was not called with correct Id')
        })
    })
  })

  describe('#QueueWorker.isValidTaskSpec', () => {

    let taskSpec = null

    const { isValidTaskSpec } = th.QueueWorker

    beforeEach(() => {
      taskSpec = _.clone(th.validBasicTaskSpec)
    })

    it('should not accept a non-plain object as a valid task spec', () => 
      nonPlainObjects.forEach(nonPlainObject => {
        expect(isValidTaskSpec(nonPlainObject)).to.be.false;
      })
    )

    it('should not accept an empty object as a valid task spec', () => {
      expect(isValidTaskSpec({})).to.be.false
    })

    it('should not accept a non-empty object without the required keys as a valid task spec', () => {
      expect(isValidTaskSpec({ foo: 'bar' })).to.be.false
    })

    it('should not accept a startState that is not a string as a valid task spec', () => 
      nonStringsWithoutNull.forEach(nonStringObject => {
        taskSpec.startState = nonStringObject
        expect(isValidTaskSpec(taskSpec)).to.be.false
      })
    )

    it('should not accept an inProgressState that is not a string as a valid task spec', () => 
      nonStrings.forEach(nonStringObject => {
        taskSpec.inProgressState = nonStringObject
        expect(isValidTaskSpec(taskSpec)).to.be.false
      })
    )

    it('should not accept a finishedState that is not a string as a valid task spec', () => 
      nonStringsWithoutNull.forEach(nonStringObject => {
        taskSpec.finishedState = nonStringObject
        expect(isValidTaskSpec(taskSpec)).to.be.false
      })
    )

    it('should not accept a finishedState that is not a string as a valid task spec', () => 
      nonStringsWithoutNull.forEach(nonStringObject => {
        taskSpec.errorState = nonStringObject
        expect(isValidTaskSpec(taskSpec)).to.be.false
      })
    )

    it('should not accept a timeout that is not a positive integer as a valid task spec', () => 
      nonPositiveIntegers.forEach(nonPositiveIntegerObject => {
        taskSpec.timeout = nonPositiveIntegerObject
        expect(isValidTaskSpec(taskSpec)).to.be.false
      })
    )

    it('should not accept a retries that is not a positive or 0 integer as a valid task spec', () => 
      nonPositiveIntegersWithout0.forEach(nonPositiveIntegerObject => {
        taskSpec.retries = nonPositiveIntegerObject
        expect(isValidTaskSpec(taskSpec)).to.be.false
      })
    )

    it('should accept a valid task spec without a timeout', () => {
      expect(isValidTaskSpec(th.validBasicTaskSpec)).to.be.true
    })

    it('should accept a valid task spec with a startState', () => {
      expect(isValidTaskSpec(th.validTaskSpecWithStartState)).to.be.true
    })

    it('should not accept a taskSpec with the same startState and inProgressState', () => {
      taskSpec.startState = taskSpec.inProgressState
      expect(isValidTaskSpec(taskSpec)).to.be.false
    })

    it('should accept a valid task spec with a finishedState', () => {
      expect(isValidTaskSpec(th.validTaskSpecWithFinishedState)).to.be.true
    })

    it('should not accept a taskSpec with the same finishedState and inProgressState', () => {
      taskSpec.finishedState = taskSpec.inProgressState
      expect(isValidTaskSpec(taskSpec)).to.be.false
    })

    it('should accept a valid task spec with a errorState', () => {
      expect(isValidTaskSpec(th.validTaskSpecWithErrorState)).to.be.true
    })

    it('should not accept a taskSpec with the same errorState and inProgressState', () => {
      taskSpec.errorState = taskSpec.inProgressState
      expect(isValidTaskSpec(taskSpec)).to.be.false
    })

    it('should accept a valid task spec with a timeout', () => {
      expect(isValidTaskSpec(th.validTaskSpecWithTimeout)).to.be.true
    })

    it('should accept a valid task spec with retries', () => {
      expect(isValidTaskSpec(th.validTaskSpecWithRetries)).to.be.true
    })

    it('should accept a valid task spec with 0 retries', () => {
      taskSpec.retries = 0
      expect(isValidTaskSpec(taskSpec)).to.be.true
    })

    it('should not accept a taskSpec with the same startState and finishedState', () => {
      taskSpec = _.clone(th.validTaskSpecWithFinishedState)
      taskSpec.startState = taskSpec.finishedState
      expect(isValidTaskSpec(taskSpec)).to.be.false
    })

    it('should accept a taskSpec with the same errorState and startState', () => {
      taskSpec = _.clone(th.validTaskSpecWithStartState)
      taskSpec.errorState = taskSpec.startState
      expect(isValidTaskSpec(taskSpec)).to.be.true
    })

    it('should accept a taskSpec with the same errorState and finishedState', () => {
      taskSpec = _.clone(th.validTaskSpecWithFinishedState)
      taskSpec.errorState = taskSpec.finishedState
      expect(isValidTaskSpec(taskSpec)).to.be.true
    })

    it('should accept a valid task spec with a startState, a finishedState, an errorState, a timeout, and retries', () => {
      expect(isValidTaskSpec(th.validTaskSpecWithEverything)).to.be.true
    })

    it('should accept a valid basic task spec with null parameters for everything else', () => {
      taskSpec = _.assign(taskSpec, {
        startState: null,
        finishedState: null,
        errorState: null,
        timeout: null,
        retries: null
      })
      expect(isValidTaskSpec(taskSpec)).to.be.true
    })
  })

  describe('#setTaskSpec', () => {
    let qw

    before(done => {
      tasksRef.set(null).then(done)
    })

    beforeEach(() => {
      qw = new th.QueueWorkerWithoutProcessingOrTimeouts(tasksRef, '0', true, false, _.noop)
    })

    afterEach(done => {
      qw.shutdown()
        .then(_ => tasksRef.set(null))
        .then(done)
    })

    /*
      These are quite problematic, the code inhere it very much tied to 
      the implementation.

      My guess is that these were created after the fact and have been copied
      and pasted. It will be rough to dig through them and turn them into specs
      that test the behaviour or effect of a certain call.
    */

    it.skip('should use task worker to select new tasks', () => {})

    it('should reset the worker when called with an invalid task spec', () => {
      let result = null
      function TaskWorker({ spec }) {
        result = spec
        this.hasTimeout = () => false
      }
      return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
        invalidTaskSpecs.forEach(invalidTaskSpec => {
          const oldTaskNumber = qw._taskNumber()
          qw.setTaskSpec(invalidTaskSpec)
          expect(qw._taskNumber()).to.not.equal(oldTaskNumber)
          expect(result.startState).to.be.null
          expect(result.inProgressState).to.be.null
          expect(result.finishedState).to.be.null
          expect(result.timeout).to.be.null
          expect(qw._newTaskRef()).to.be.null
          expect(qw._newTaskListener()).to.be.null
          expect(qw._expiryTimeouts).to.deep.equal({})
        })
      })
    })

    it('should reset the worker when called with an invalid task spec after a valid task spec', () => {
      let result = null
      function TaskWorker({ spec }) {
        result = spec
        this.hasTimeout = () => false
        this.getNextFrom = ref => ref
      }
      return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
        invalidTaskSpecs.forEach(invalidTaskSpec => {
          qw.setTaskSpec(th.validBasicTaskSpec)
          const oldTaskNumber = qw._taskNumber()
          qw.setTaskSpec(invalidTaskSpec)
          expect(qw._taskNumber()).to.not.equal(oldTaskNumber)
          expect(result.startState).to.be.null
          expect(result.inProgressState).to.be.null
          expect(result.finishedState).to.be.null
          expect(result.timeout).to.be.null
          expect(qw._newTaskRef()).to.be.null
          expect(qw._newTaskListener()).to.be.null
          expect(qw._expiryTimeouts).to.deep.equal({})
        })
      })
    })

    it('should reset the worker when called with an invalid task spec after a valid task spec with everythin', () => {
      let result = null
      function TaskWorker({ spec }) {
        result = spec
        this.hasTimeout = () => false
        this.getNextFrom = ref => ref
      }
      return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
        invalidTaskSpecs.forEach(invalidTaskSpec => {
          qw.setTaskSpec(th.validTaskSpecWithEverything)
          const oldTaskNumber = qw._taskNumber()
          qw.setTaskSpec(invalidTaskSpec)
          expect(qw._taskNumber()).to.not.equal(oldTaskNumber)
          expect(result.startState).to.be.null
          expect(result.inProgressState).to.be.null
          expect(result.finishedState).to.be.null
          expect(result.timeout).to.be.null
          expect(qw._newTaskRef()).to.be.null
          expect(qw._newTaskListener()).to.be.null
          expect(qw._expiryTimeouts).to.deep.equal({})
        })
      })
    })

    it('should reset a worker when called with a basic valid task spec', () => {
      let result = null
      function TaskWorker({ spec }) {
        result = spec
        this.hasTimeout = () => false
        this.getNextFrom = ref => ref
      }
      return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
        const oldTaskNumber = qw._taskNumber()
        qw.setTaskSpec(th.validBasicTaskSpec)
        expect(qw._taskNumber()).to.not.equal(oldTaskNumber)
        expect(result.startState).to.be.null
        expect(result.inProgressState).to.equal(th.validBasicTaskSpec.inProgressState)
        expect(result.finishedState).to.be.null
        expect(result.timeout).to.be.null
        expect(qw._newTaskRef()).to.have.property('on').and.be.a('function')
        expect(qw._newTaskListener()).to.be.a('function')
        expect(qw._expiryTimeouts).to.deep.equal({})
      })
    })

    it('should reset a worker when called with a valid task spec with a startState', () => {
      let result = null
      function TaskWorker({ spec }) {
        result = spec
        this.hasTimeout = () => false
        this.getNextFrom = ref => ref
      }
      return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
        const oldTaskNumber = qw._taskNumber()
        qw.setTaskSpec(th.validTaskSpecWithStartState)
        expect(qw._taskNumber()).to.not.equal(oldTaskNumber)
        expect(result.startState).to.equal(th.validTaskSpecWithStartState.startState)
        expect(result.inProgressState).to.equal(th.validTaskSpecWithStartState.inProgressState)
        expect(result.finishedState).to.be.null
        expect(result.timeout).to.be.null
        expect(qw._newTaskRef()).to.have.property('on').and.be.a('function')
        expect(qw._newTaskListener()).to.be.a('function')
        expect(qw._expiryTimeouts).to.deep.equal({})
      })
    })

    it('should reset a worker when called with a valid task spec with a finishedState', () => {
      let result = null
      function TaskWorker({ spec }) {
        result = spec
        this.hasTimeout = () => false
        this.getNextFrom = ref => ref
      }
      return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
        const oldTaskNumber = qw._taskNumber()
        qw.setTaskSpec(th.validTaskSpecWithFinishedState)
        expect(qw._taskNumber()).to.not.equal(oldTaskNumber)
        expect(result.startState).to.be.null
        expect(result.inProgressState).to.equal(th.validTaskSpecWithFinishedState.inProgressState)
        expect(result.finishedState).to.equal(th.validTaskSpecWithFinishedState.finishedState)
        expect(result.timeout).to.be.null
        expect(qw._newTaskRef()).to.have.property('on').and.be.a('function')
        expect(qw._newTaskListener()).to.be.a('function')
        expect(qw._expiryTimeouts).to.deep.equal({})
      })
    })

    it('should reset a worker when called with a valid task spec with a timeout', () => {
      let result = null
      function TaskWorker({ spec }) {
        result = spec
        this.hasTimeout = () => false
        this.getNextFrom = ref => ref
      }
      return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
        const oldTaskNumber = qw._taskNumber()
        qw.setTaskSpec(th.validTaskSpecWithTimeout)
        expect(qw._taskNumber()).to.not.equal(oldTaskNumber)
        expect(result.startState).to.be.null
        expect(result.inProgressState).to.equal(th.validTaskSpecWithTimeout.inProgressState)
        expect(result.finishedState).to.be.null
        expect(result.timeout).to.equal(th.validTaskSpecWithTimeout.timeout)
        expect(qw._newTaskRef()).to.have.property('on').and.be.a('function')
        expect(qw._newTaskListener()).to.be.a('function')
        expect(qw._expiryTimeouts).to.deep.equal({})
      })
    })

    it('should reset a worker when called with a valid task spec with everything', () => {
      let result = null
      function TaskWorker({ spec }) {
        result = spec
        this.hasTimeout = () => false
        this.getNextFrom = ref => ref
      }
      return withQueueWorkerFor({ tasksRef, TaskWorker }, qw => {
        const oldTaskNumber = qw._taskNumber()
        qw.setTaskSpec(th.validTaskSpecWithEverything)
        expect(qw._taskNumber()).to.not.equal(oldTaskNumber)
        expect(result.startState).to.equal(th.validTaskSpecWithEverything.startState)
        expect(result.inProgressState).to.equal(th.validTaskSpecWithEverything.inProgressState)
        expect(result.finishedState).to.equal(th.validTaskSpecWithEverything.finishedState)
        expect(result.timeout).to.equal(th.validTaskSpecWithEverything.timeout)
        expect(qw._newTaskRef()).to.have.property('on').and.be.a('function')
        expect(qw._newTaskListener()).to.be.a('function')
        expect(qw._expiryTimeouts).to.deep.equal({})
      })
    })

    it('should not pick up tasks on the queue not for the current worker', () => {
      // This current version of the spec shows that it causes the worker to stall.
      // A different implementation of the worker might make this spec succeed,
      // in that case this spec should be written differently:
      //
      // Make 2 queues where one contains [b1, b2] and the other [c, c, c, b3]
      // Both queues respond to `b` tasks. If the implementation is correct, b3
      // will be faster, if incorrect b2 will be faster

      qw = new th.QueueWorker(tasksRef, '0', true, false, th.echo)
      return Promise.all([
        tasksRef.push({ '_state': '1.start' }),
        tasksRef.push({ '_state': '2.start', test: 'check' })
      ]).then(([_, ref]) => {
        qw.setTaskSpec({ startState: '2.start', inProgressState: 'in_progress', finishedState: 'done'})
        return Promise.race([
          th.waitForState(ref, 'done').then(snapshot => snapshot.val()),
          th.timeout(1000)
        ])
      }).then(val => {
        expect(val).to.have.a.property('test').that.equals('check')
      })
    })

    it('should pick up tasks on the queue with no "_state" when a task is specified without a startState', () => {
      let result = null
      qw = new th.QueueWorker(tasksRef, '0', true, false, th.withData(data => { result = data }))
      qw.setTaskSpec(th.validBasicTaskSpec)
      const task = { foo: 'bar' }
      return tasksRef.push(task)
        .then(_ => th.waitFor(() => !!result, 500))
        .then(_ => {
          expect(result).to.deep.equal(task)
        })
    })

    it('should pick up tasks on the queue with the corresponding "_state" when a task is specifies a startState', () => {
      let result = null
      qw = new th.QueueWorker(tasksRef, '0', true, false, th.withData(data => { result = data }))
      qw.setTaskSpec(th.validTaskSpecWithStartState)
      const task = { foo: 'bar', '_state': th.validTaskSpecWithStartState.startState }
      return tasksRef.push(task)
        .then(_ => th.waitFor(() => !!result, 500))
        .then(_ => {
          delete task._state
          expect(result).to.deep.equal(task)
        })
    })
  })

  describe('#shutdown', () => {
    let qw
    let callbackStarted
    let callbackComplete

    beforeEach((done) => {
      callbackStarted = false
      callbackComplete = false
      qw = new th.QueueWorker(tasksRef, '0', true, false, function(data, progress, resolve) {
        callbackStarted = true
        setTimeout(() => {
          callbackComplete = true
          resolve()
        }, 500)
      })

      tasksRef.push().set(null).then(done)
    })

    it('should shutdown a worker not processing any tasks', () => {
      return qw.shutdown().should.eventually.be.fulfilled;
    })

    it('should shutdown a worker after the current task has finished', () => {
      expect(callbackStarted).to.be.false
      qw.setTaskSpec(th.validBasicTaskSpec)
      return tasksRef.push({
        foo: 'bar'
      }).then(_ => new Promise(r => setTimeout(r, 400)))
        .then(_ => {
          expect(callbackStarted).to.be.true
          expect(callbackComplete).to.be.false
          return qw.shutdown()
        })
        .then(_ => {
          expect(callbackComplete).to.be.true;
        })
    })

    it('should return the same shutdown promise if shutdown is called twice', () => {
      qw.setTaskSpec(th.validBasicTaskSpec)
      return tasksRef.push({
        foo: 'bar'
      }).then(_ => {
          const firstPromise = qw.shutdown()
          const secondPromise = qw.shutdown()
          expect(firstPromise).to.deep.equal(secondPromise)
          return firstPromise
      })
    })
  })
})
