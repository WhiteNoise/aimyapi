import { ChatCompletionRequestMessage } from "openai";
import { delay } from "../lib/utils";
import {
	Customization,
	Menu,
	MenuItemBase,
	OrderingAPIInterface,
} from "./ordering_api";

// TODO: make functions to print out an item, and print out the current order with the price totals.

export class OrderingAPI implements OrderingAPIInterface {
	private _order: MenuItemBase[] = [];
	private _lastOrderIdNumber: number = 0;

	private _history: ChatCompletionRequestMessage[] = [];

	// Mock implementation, doesn't actually send an email
	sendEmail(to: string, subject: string, body: string): Promise<void> {
		console.log(
			`Sending email to "${to}" with subject "${subject}" and body\n"${body}"`
		);
		return delay(1000);
	}

	respondToUser(text: string): void {
		console.log(text);
		this._history.push({
			role: "assistant",
			content: "Response output: " + text,
		});
	}

	delay(milliseconds: number): Promise<void> {
		return delay(milliseconds);
	}

	getCurrentOrder(): MenuItemBase[] {
		return this._order;
	}

	// addItemToOrder(item: MenuItemBase) {
	//     item.orderId = "" + (this._lastOrderIdNumber++);
	//     this._order.push(item);
	// }

	getCustomizationByName(
		itemName: string,
		name: string
	): Customization | undefined {
		const item = Menu.find((item) => item.name === itemName);
		if (!item) {
			return undefined;
		}

		return item.allowedCustomizations.find(
			(customization) => customization.name === name
		);
	}

	addItemToOrder(
		itemName: string,
		customizationNames: string[],
		toppings: string[]
	) {
		const item = Menu.find((item) => item.name === itemName);
		if (!item) {
			throw new Error(`Item with name "${itemName}" not found`);
		}

		const customizations = customizationNames
			.map((customizationName) => {
				return this.getCustomizationByName(itemName, customizationName);
			})
			.filter(
				(customization) => customization !== undefined
			) as Customization[];

		const newItem = {
			...item,
			customizations,
			toppings: toppings,
			orderId: "" + this._lastOrderIdNumber++,
		};

		this._order.push(newItem);

		this.respondToUser(`Added ${itemName} with id ${newItem.orderId}`);
		this.displayItem(newItem);
	}

    getItemInOrder(itemOrderId: string): MenuItemBase {
        const item = this._order.find((item) => item.orderId === itemOrderId);
        if (!item) {
            return undefined;
        }

        return item;
    }

	removeItemFromOrder(itemOrderId: string) {
		this._order = this._order.filter((item) => item.orderId !== itemOrderId);

		this.respondToUser(`Removed item ${itemOrderId}`);
	}

	modifyItemInOrder(
		itemOrderId: string,
		customizationNames: string[],
		toppings: string[]
	) {
		const existingIndex = this._order.findIndex(
			(item) => item.orderId === itemOrderId
		);

		if (existingIndex !== -1) {
			const customizations = customizationNames
				.map((customizationName) => {
					return this.getCustomizationByName(
						this._order[existingIndex].name,
						customizationName
					);
				})
				.filter(
					(customization) => customization !== undefined
				) as Customization[];

			this._order[existingIndex].customizations = customizations;
			this._order[existingIndex].toppings = toppings;
		} else {
			throw new Error(`Item with id #"${itemOrderId}" not found in order`);
		}

		this.respondToUser(`Modified item ${itemOrderId}`);
	}

	getOrderTotal() {
		const total = this._order.reduce((total, item) => {
			const customizationTotal = item.customizations.reduce(
				(total, customization) => {
					return total + customization?.priceAdjustment || 0;
				},
				0
			);
			return total + item.price + customizationTotal;
		}, 0);

		return total;
	}

	completeOrder(): void {
		this.displayOrder();
		this.respondToUser("Order completed!");

		this._lastOrderIdNumber = 0;
        // clear history
        this._history = []
	}

	displayItem(item: MenuItemBase) {
		this.respondToUser(
			`\t#${item.orderId || ""} ${item.name}...\t\t$${item.price.toFixed(2)}`
		);
		item.toppings.forEach((topping) => {
			this.respondToUser(`\t\t${topping}`);
		});
		item.customizations.forEach((customization) => {
			this.respondToUser(
				`\t\t${customization.name}...\t$${customization.priceAdjustment.toFixed(
					2
				)}`
			);
		});
	}

	displayOrder() {
		this.respondToUser("----\n\nDisplaying order:\n\n");
		this._order.forEach((item) => this.displayItem(item));
		this.respondToUser(`--\tTotal:\t\t$${this.getOrderTotal()}`);
	}

	_addMessageToHistory(message: ChatCompletionRequestMessage) {
		this._history.push(message);
	}

	_getHistory(): ChatCompletionRequestMessage[] {
		return this._history;
	}
}
