import { createSlice } from '@reduxjs/toolkit'
import { composeReducers } from 'redux-compose'
import { all, select, call } from 'redux-saga/effects'
import { makeDefaultCommandsSagas } from './utils'

export default ({
	init,
	path,
	initialState,
	name,
	commands: cmdsFactory = () => {},
	events: eventsReducers = {},
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
	if (cmdsFactory && typeof cmdsFactory !== 'function') {
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
			[k]: (payload) => select((state) => q(state, payload)),
		}),
		{},
	)

	// events
	const eventsSlice = createSlice({
		name: `${fullPath}/events`,
		initialState,
		reducers: eventsReducers,
		extraReducers,
	})
	const events = eventsSlice.actions

	// forward declarations
	const allTxs = {}
	const commands = {}
	// this allows to pass the transactions and commands to the transactions and commands factories

	const ctx = { sq: sagaQueries, transactions: allTxs, events, commands }

	// commands
	const commandsReducers = {}
	const commandsTxs = {}
	for (const [key, cmd] of Object.entries(cmdsFactory(ctx))) {
		if (typeof cmd === 'function') {
			commandsTxs[key] = cmd
			commandsReducers[key] = (state) => state
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
	for (const [k, v] of Object.entries(commandsSlice.actions)) {
		commands[k] = v
	}

	// transactions
	for (const [k, t] of Object.entries({
		...commandsTxs,
		...transactions(ctx),
	})) {
		allTxs[k] = t
	}

	// orchestrator
	const orchestrator = function* () {
		if (init) {
			yield call(init)
		}
		yield all([...effects(ctx), ...makeDefaultCommandsSagas(commands, commandsTxs)])
	}

	// reducer
	const reducer = allowReducedCommands
		? composeReducers(commandsSlice.reducer, eventsSlice.reducer)
		: eventsSlice.reducer

	console.log(name, 'commands:', commands)

	// ret
	return {
		name,
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
