import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmDialog } from ".";

describe("ConfirmDialog", () => {
	it("focuses cancel first and supports Escape without confirming", () => {
		const onCancel = jest.fn();
		const onConfirm = jest.fn();
		render(
			<ConfirmDialog
				open
				title="Delete action?"
				message="This cannot be undone."
				onCancel={onCancel}
				onConfirm={onConfirm}
			/>,
		);
		const dialog = screen.getByRole("alertdialog", { name: "Delete action?" });
		expect(dialog).toHaveTextContent("This cannot be undone.");
		expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
		fireEvent.keyDown(dialog, { key: "Escape" });
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onConfirm).not.toHaveBeenCalled();
	});
});
