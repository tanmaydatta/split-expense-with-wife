import React from "react";
import "./index.css";

interface ToggleButtonGroupProps {
	value: string;
	onChange: (value: string) => void;
	name: string;
	children: React.ReactNode;
	className?: string;
	style?: React.CSSProperties;
	disabled?: boolean;
	"data-test-id"?: string;
}

export const ToggleButtonGroup: React.FC<ToggleButtonGroupProps> = ({
	value,
	onChange,
	name,
	children,
	className = "",
	style,
	disabled = false,
	"data-test-id": dataTestId,
}) => {
	return (
		<div
			className={`toggle-button-group ${className}`}
			style={style}
			role="radiogroup"
			aria-label={name}
			data-test-id={dataTestId}
		>
			{React.Children.map(children, (child) => {
				if (React.isValidElement(child)) {
					return React.cloneElement(child, {
						...child.props,
						onChange,
						name,
						isSelected: child.props.value === value,
						disabled: disabled,
					});
				}
				return child;
			})}
		</div>
	);
};

interface ToggleButtonProps {
	value: string;
	children: React.ReactNode;
	onChange?: (value: string) => void;
	name?: string;
	isSelected?: boolean;
	id?: string;
	type?: string;
	variant?: string;
	checked?: boolean;
	disabled?: boolean;
	"data-test-id"?: string;
}

export const ToggleButton: React.FC<ToggleButtonProps> = ({
	value,
	children,
	onChange,
	name: _name,
	isSelected = false,
	id,
	type: _type = "radio",
	variant = "outline-primary",
	checked: _checked,
	disabled = false,
	"data-test-id": dataTestId,
}) => {
	const handleClick = () => {
		if (disabled || !onChange) {
			return;
		}
		onChange(value);
	};

	return (
		<button
			id={id}
			type="button"
			className={`toggle-button toggle-button-${variant} ${isSelected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
			onClick={handleClick}
			disabled={disabled}
			role="radio"
			aria-checked={isSelected}
			aria-label={typeof children === "string" ? children : value}
			data-test-id={dataTestId}
		>
			{children}
		</button>
	);
};
