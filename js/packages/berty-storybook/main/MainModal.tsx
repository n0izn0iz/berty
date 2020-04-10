import React, { Component } from 'react'
import {
	StyleSheet,
	Modal as RNModal,
	TouchableOpacity,
	TouchableWithoutFeedback,
} from 'react-native'
import * as Animatable from 'react-native-animatable'
import { BlurView } from '@react-native-community/blur'
import { PanGestureHandler, State } from 'react-native-gesture-handler'

class ModalCustom extends Component<{ items: { header: Element; content: Element }[] }> {
	constructor(props) {
		super(props)
		const { items } = this.props
		this.state = {
			visible: true,
			openTab: 0,
		}
		this.containerHeight = items[0].contentHeight + items.length * 60
		this.containerHeightFromChilds = items[0].contentHeight + items.length * 60
		this.item1ContentHeight = items[0].contentHeight
		this.item2ContentHeight = 0
		this.translationY = 0
		this.translationYC = 0
	}
	componentDidMount() {
		this.slideUpContent()
	}
	onMoveFirstTab = (e) => {
		if (this.slidingFirstTab) {
			return
		}
		let heightValue = e.nativeEvent.translationY
		if (Math.sign(e.nativeEvent.translationY) === -1 && Math.sign(this.translationYC) === -1) {
			heightValue = Math.abs(e.nativeEvent.translationY) - Math.abs(this.translationYC)
			heightValue *= -1
		} else if (Math.sign(e.nativeEvent.translationY) === 1 && Math.sign(this.translationYC) === 1) {
			heightValue = e.nativeEvent.translationY - this.translationYC
		}

		const animateValue = this.containerHeight - heightValue
		if (animateValue > this.containerHeightFromChilds + 120) {
			this.slideUpContent()
			return
		}
		this.translationYC = e.nativeEvent.translationY
		this.containerHeight = animateValue
		this.animRefContainer.transitionTo(
			{
				height: animateValue,
			},
			0,
		)
	}
	onMove = (e) => {
		if (this.sliding) {
			return
		}
		if (!this.translationY) {
			this.translationY === e.nativeEvent.translationY
		}
		const { items } = this.props
		const item1 = items[0]
		const item2 = items[1]
		let heightValue = e.nativeEvent.translationY
		if (Math.sign(e.nativeEvent.translationY) === -1 && Math.sign(this.translationY) === -1) {
			heightValue = Math.abs(e.nativeEvent.translationY) - Math.abs(this.translationY)
			heightValue *= -1
		} else if (Math.sign(e.nativeEvent.translationY) === 1 && Math.sign(this.translationY) === 1) {
			heightValue = e.nativeEvent.translationY - this.translationY
		}
		let animateItem1Value = this.item1ContentHeight + heightValue
		if (animateItem1Value > item1.contentHeight) {
			animateItem1Value = item1.contentHeight
		} else if (animateItem1Value < 0) {
			animateItem1Value = 0
		}
		let animateItem2Value = this.item2ContentHeight - heightValue

		if (animateItem2Value > item2.contentHeight) {
			animateItem2Value = item2.contentHeight
		} else if (animateItem2Value < 0) {
			animateItem2Value = 0
		}
		this.item1ContentHeight = animateItem1Value
		this.item2ContentHeight = animateItem2Value
		this.translationY = e.nativeEvent.translationY
		if (
			this.item1ContentHeight + items.length * 60 > this.containerHeight ||
			this.item2ContentHeight + items.length * 60 > this.containerHeight
		) {
			this.containerHeight = this.containerHeight + Math.abs(heightValue)
			this.animRefContainer.transitionTo(
				{
					height: this.containerHeight,
				},
				0,
			)
		}

		if (
			this.item1ContentHeight + this.item2ContentHeight <
			this.containerHeight - items.length * 60
		) {
			this.containerHeight = this.containerHeight - Math.abs(heightValue)
			this.animRefContainer.transitionTo(
				{
					height: this.containerHeight,
				},
				0,
			)
		}
		this.animRef0.transitionTo(
			{
				height: animateItem1Value,
			},
			0,
		)
		this.animRef1.transitionTo(
			{
				height: animateItem2Value,
			},
			0,
		)
	}
	slideUpContent = () => {
		this.slidingFirstTab = true
		const { items } = this.props
		const item1 = items[0]
		this.animRefContainer.transitionTo(
			{
				height: this.containerHeightFromChilds || item1.contentHeight + items.length * 60,
			},
			300,
			'ease-out',
		)
		this.containerHeight = this.containerHeightFromChilds
		setTimeout(() => {
			this.slidingFirstTab = false
		}, 300)
	}
	slideDownContent = () => {
		this.slidingFirstTab = true
		const { closeModal } = this.props
		this.animRefContainer.transitionTo(
			{
				height: 0,
			},
			300,
			'ease-out',
		)
		this.containerHeight = this.containerHeightFromChilds
		setTimeout(() => {
			this.setState({ visible: true })
			this.slidingFirstTab = false
			closeModal()
		}, 310)
	}
	slideUp = () => {
		this.sliding = true
		const { items } = this.props
		const item1 = items[0]
		this.animRef0.transitionTo(
			{
				height: item1.contentHeight,
			},
			300,
			'ease-out',
		)
		this.animRef1.transitionTo(
			{
				height: 0,
			},
			300,
			'ease-out',
		)
		this.animRefContainer.transitionTo(
			{
				height: item1.contentHeight + items.length * 60,
			},
			300,
			'ease-out',
		)
		setTimeout(() => {
			this.sliding = false
		}, 310)
		this.item1ContentHeight = item1.contentHeight
		this.item2ContentHeight = 0
		this.containerHeight = item1.contentHeight + items.length * 60
		this.containerHeightFromChilds = item1.contentHeight + items.length * 60
	}
	slideDown = () => {
		const { items } = this.props
		const item2 = items[1]
		this.animRef0.transitionTo(
			{
				height: 0,
			},
			300,
			'ease-out',
		)
		this.animRef1.transitionTo(
			{
				height: item2.contentHeight,
			},
			300,
			'ease-out',
		)
		this.animRefContainer.transitionTo(
			{
				height: item2.contentHeight + items.length * 60,
			},
			300,
			'ease-out',
		)
		setTimeout(() => {
			this.sliding = false
		}, 310)
		this.item1ContentHeight = 0
		this.item2ContentHeight = item2.contentHeight
		this.containerHeight = item2.contentHeight + items.length * 60
		this.containerHeightFromChilds = item2.contentHeight + items.length * 60
	}
	_handleStateChange = ({ nativeEvent }) => {
		if (nativeEvent.state === State.END) {
			if (Math.sign(nativeEvent.translationY) === -1) {
				if (Math.abs(this.translationY) > 80) {
					this.slideDown()
				} else {
					this.slideUp()
				}
			} else if (Math.sign(nativeEvent.translationY) === 1) {
				if (Math.abs(this.translationY) > 80) {
					this.slideUp()
				} else {
					this.slideDown()
				}
			}
			this.translationY = 0
		}
	}
	_handleStateChangeFirstTab = ({ nativeEvent }) => {
		if (nativeEvent.state === State.END) {
			if (Math.sign(nativeEvent.translationY) === -1) {
				this.slideUpContent()
			} else if (Math.sign(nativeEvent.translationY) === 1) {
				if (Math.abs(this.translationYC) > 100) {
					this.slideDownContent()
				} else {
					this.slideUpContent()
				}
			}
			this.translationYC = 0
		}
	}
	render() {
		const { items } = this.props
		return (
			<BlurView style={styles.blurView} blurType='light' blurAmount={10}>
				<TouchableOpacity
					activeOpacity={1}
					onPress={() => this.slideDownContent()}
					style={styles.backDrop}
				>
					<Animatable.View
						ref={(ref) => {
							this.animRefContainer = ref
						}}
						style={[styles.modalContainer]}
					>
						<TouchableOpacity onPress={() => this.slideUp()}>
							<PanGestureHandler
								onGestureEvent={(e) => this.onMoveFirstTab(e)}
								onHandlerStateChange={this._handleStateChangeFirstTab}
							>
								{items[0].header}
							</PanGestureHandler>
						</TouchableOpacity>

						<Animatable.View
							ref={(ref) => {
								this.animRef0 = ref
							}}
							style={[styles.tabContent, { height: items[0].contentHeight }]}
						>
							<TouchableWithoutFeedback onPress={() => {}}>
								{items[0].content}
							</TouchableWithoutFeedback>
						</Animatable.View>
						<TouchableOpacity onPress={() => this.slideDown()}>
							<PanGestureHandler
								onGestureEvent={(e) => this.onMove(e)}
								onHandlerStateChange={this._handleStateChange}
							>
								{items[1].header}
							</PanGestureHandler>
						</TouchableOpacity>
						<Animatable.View
							ref={(ref) => {
								this.animRef1 = ref
							}}
							style={[styles.tabContent]}
						>
							<TouchableWithoutFeedback onPress={() => {}}>
								{items[1].content}
							</TouchableWithoutFeedback>
						</Animatable.View>

						<TouchableOpacity onPress={() => items[2].onPress()}>
							{items[2].header}
						</TouchableOpacity>
					</Animatable.View>
				</TouchableOpacity>
			</BlurView>
		)
	}
}
const styles = StyleSheet.create({
	bottomModal: {
		justifyContent: 'flex-end',
		margin: 0,
	},
	modalContainer: {
		borderTopLeftRadius: 30,
		borderTopRightRadius: 30,
		backgroundColor: '#fff',
		paddingHorizontal: 2,
	},
	blurView: {
		position: 'absolute',
		top: 0,
		left: 0,
		bottom: 0,
		right: 0,
	},
	backDrop: {
		justifyContent: 'flex-end',
		flex: 1,
	},
	tabContent: {
		overflow: 'hidden',
	},
})

export default ModalCustom
