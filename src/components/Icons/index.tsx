import React from "react";
import "./index.css";

interface IconProps {
	size?: number;
	color?: string;
	className?: string;
	style?: React.CSSProperties;
	onClick?: (e: React.MouseEvent) => void;
	[key: string]: any; // Allow any additional props like data-test-id
}

export const Trash: React.FC<IconProps> = ({
	size = 16,
	color = "currentColor",
	className = "",
	style,
	onClick,
	...additionalProps
}) => (
	<svg
		width={size}
		height={size}
		fill={color}
		className={`icon icon-trash ${className}`}
		viewBox="0 0 16 16"
		aria-label="Delete"
		style={style}
		onClick={onClick}
		role={onClick ? "button" : undefined}
		tabIndex={onClick ? 0 : undefined}
		{...additionalProps}
	>
		<path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
		<path
			fillRule="evenodd"
			d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
		/>
	</svg>
);

export const Calendar: React.FC<IconProps> = ({
	size = 16,
	color = "currentColor",
	className = "",
	style,
	onClick,
	...additionalProps
}) => (
	<svg
		width={size}
		height={size}
		fill={color}
		className={`icon icon-calendar ${className}`}
		viewBox="0 0 16 16"
		aria-label="Calendar"
		style={style}
		onClick={onClick}
		role={onClick ? "button" : undefined}
		tabIndex={onClick ? 0 : undefined}
		{...additionalProps}
	>
		<path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4H1z" />
	</svg>
);

export const CardText: React.FC<IconProps> = ({
	size = 16,
	color = "currentColor",
	className = "",
	style,
	onClick,
	...additionalProps
}) => (
	<div className="card-text-icon">
		<svg
			width={size}
			height={size}
			fill={color}
			className={`icon icon-card-text ${className}`}
			viewBox="0 0 16 16"
			aria-label="Card Text"
			style={style}
			onClick={onClick}
			role={onClick ? "button" : undefined}
			tabIndex={onClick ? 0 : undefined}
			{...additionalProps}
		>
			<path d="M14.5 3a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h13zm-13-1A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2h-13z" />
			<path d="M3 5.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zM3 8a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9A.5.5 0 0 1 3 8zm0 2.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5z" />
		</svg>
	</div>
);

export const Coin: React.FC<IconProps> = ({
	size = 16,
	color = "currentColor",
	className = "",
	style,
	onClick,
	...additionalProps
}) => (
	<svg
		width={size}
		height={size}
		fill={color}
		className={`icon icon-coin ${className}`}
		viewBox="0 0 16 16"
		aria-label="Coin"
		style={style}
		onClick={onClick}
		role={onClick ? "button" : undefined}
		tabIndex={onClick ? 0 : undefined}
		{...additionalProps}
	>
		<path d="M5.5 9.511c.076.954.83 1.697 2.182 1.785V12h.6v-.709c1.4-.098 2.218-.846 2.218-1.932 0-.987-.626-1.496-1.745-1.76l-.473-.112V5.57c.6.068.982.396 1.074.85h1.052c-.076-.919-.864-1.638-2.126-1.716V4h-.6v.719c-1.195.117-2.01.836-2.01 1.853 0 .9.606 1.472 1.613 1.707l.397.098v2.034c-.615-.093-1.022-.43-1.114-.9H5.5zm2.177-2.166c-.59-.137-.91-.416-.91-.836 0-.47.345-.822.915-.925v1.76h-.005zm.692 1.193c.717.166 1.048.435 1.048.91 0 .542-.412.914-1.135.982V8.518l.087.02z" />
		<path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
		<path d="M8 13.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zm0 .5A6 6 0 1 0 8 2a6 6 0 0 0 0 12z" />
	</svg>
);

export const XLg: React.FC<IconProps> = ({
	size = 16,
	color = "currentColor",
	className = "",
	style,
	onClick,
	...additionalProps
}) => (
	<svg
		width={size}
		height={size}
		fill={color}
		className={`icon icon-x-lg ${className}`}
		viewBox="0 0 16 16"
		aria-label="Close"
		style={style}
		onClick={onClick}
		role={onClick ? "button" : undefined}
		tabIndex={onClick ? 0 : undefined}
		{...additionalProps}
	>
		<path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z" />
	</svg>
);

export const ArrowDownUp: React.FC<IconProps> = ({
	size = 16,
	color = "currentColor",
	className = "",
	style,
	onClick,
	...additionalProps
}) => (
	<svg
		width={size}
		height={size}
		fill={color}
		className={`icon icon-arrow-down-up ${className}`}
		viewBox="0 0 16 16"
		aria-label="Sort"
		style={style}
		onClick={onClick}
		role={onClick ? "button" : undefined}
		tabIndex={onClick ? 0 : undefined}
		{...additionalProps}
	>
		<path
			fillRule="evenodd"
			d="M11.5 15a.5.5 0 0 0 .5-.5V2.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L11 2.707V14.5a.5.5 0 0 0 .5.5zm-7-14a.5.5 0 0 1 .5.5v11.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 .708-.708L4 13.293V1.5a.5.5 0 0 1 .5-.5z"
		/>
	</svg>
);

export const Plus: React.FC<IconProps> = ({
	size = 16,
	color = "currentColor",
	className = "",
	style,
	onClick,
	...additionalProps
}) => (
	<svg
		width={size}
		height={size}
		fill={color}
		className={`icon icon-plus ${className}`}
		viewBox="0 0 16 16"
		aria-label="Add"
		style={style}
		onClick={onClick}
		role={onClick ? "button" : undefined}
		tabIndex={onClick ? 0 : undefined}
		{...additionalProps}
	>
		<path d="M8 1a.5.5 0 0 1 .5.5V7.5H14.5a.5.5 0 0 1 0 1H8.5V14.5a.5.5 0 0 1-1 0V8.5H1.5a.5.5 0 0 1 0-1H7.5V1.5A.5.5 0 0 1 8 1z" />
	</svg>
);

export const ArrowLeft: React.FC<IconProps> = ({
	size = 16,
	color = "currentColor",
	className = "",
	style,
	onClick,
	...additionalProps
}) => (
	<svg
		width={size}
		height={size}
		fill={color}
		className={`icon icon-arrow-left ${className}`}
		viewBox="0 0 16 16"
		aria-label="Back"
		style={style}
		onClick={onClick}
		role={onClick ? "button" : undefined}
		tabIndex={onClick ? 0 : undefined}
		{...additionalProps}
	>
		<path
			fillRule="evenodd"
			d="M15 8a.5.5 0 0 1-.5.5H3.707l3.147 3.146a.5.5 0 0 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 1 1 .708.708L3.707 7.5H14.5A.5.5 0 0 1 15 8z"
		/>
	</svg>
);
