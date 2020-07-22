import { createSlice } from '@reduxjs/toolkit'
import { composeReducers } from 'redux-compose'
import { all, select, call } from 'redux-saga/effects'
import { makeDefaultCommandsSagas } from './utils'

export default ({
	init,
	path,
	initialState,
	name,
	commands: cmdsDef = () => {},
	events: eventsDef = {},
	transactions = () => {},
	queries = {},
	effects = () => [],
	allowReducedCommands,
	extraReducers,
	exports = {},
}) => {
	// input check
	if (typeof name !== 'string' || !name) {
		throw new Error('Invalid slice name')
	}
	if (queries && typeof queries !== 'object') {
		throw new Error('Invalid queries')
	}
	if (cmdsDef && typeof cmdsDef !== 'function') {
		throw new Error('Invalid commands')
	}
	if (effects && typeof effects !== 'function') {
		throw new Error('Invalid effects')
	}
	if (transactions && typeof transactions !== 'function') {
		throw new Error('Invalid commands')
	}
	if (init && typeof init !== 'function') {
		throw new Error('Invalid init type')
	}

	const fullPath = `${path ? `${path}/` : ''}${name}`

	// queries
	const sagaQueries = Object.entries(queries).reduce(
		(o, [k, q]) => ({
			...o,
			[k]: function* (payload) {
				return yield select((state) => q(state, payload))
			},
		}),
		{},
	)

	// events
	const eventsSlice = createSlice({
		name: `${fullPath}/events`,
		initialState,
		reducers: eventsDef,
		extraReducers,
	})
	const events = eventsSlice.actions

	// transactions part 1
	const allTxs = {}
	// this allows to pass the transactions object to the transactions and commands factory

	// commands
	const commandsReducers = {}
	const commandsTxs = {}
	for (const [key, cmd] of Object.entries(
		cmdsDef({ sq: sagaQueries, events, transactions: allTxs }),
	)) {
		if (typeof cmd === 'function') {
			commandsTxs[key] = cmd
			continue
		}
		if (
			typeof cmd === 'object' &&
			(!cmd.transaction || typeof cmd.transaction === 'function') &&
			(!cmd.reducer || typeof cmd.reducer === 'function')
		) {
			commandsReducers[key] = cmd.reducer || ((state) => state)
			if (cmd.transaction) {
				commandsTxs[key] = cmd.transaction
			}
			continue
		}
		throw new Error(`Invalid command definition for ${key}`)
	}
	const commandsSlice = createSlice({
		name: `${fullPath}/commands`,
		initialState: allowReducedCommands ? initialState : undefined,
		reducers: commandsReducers,
	})
	const commands = commandsSlice.actions

	// transactions part 2
	for (const [k, t] of Object.entries({
		...commandsTxs,
		...transactions({ sq: sagaQueries, transactions: allTxs }),
	})) {
		allTxs[k] = t
	}

	// orchestrator
	const orchestrator = function* () {
		if (init) {
			yield call(init)
		}
		yield all([
			...effects({ sq: sagaQueries, transactions: allTxs }),
			...makeDefaultCommandsSagas(commands, commandsTxs),
		])
	}

	// reducer
	const reducer = allowReducedCommands
		? composeReducers(commandsSlice.reducer, eventsSlice.reducer)
		: eventsSlice.reducer

	// ret
	return {
		commands,
		events,
		queries,
		sq: sagaQueries,
		transactions: allTxs,
		orchestrator,
		reducer,
		...exports,
	}
}
