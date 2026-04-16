import type { ReactNode } from "react";
import { Link } from "react-router-dom";


type SharedButtonProps = {
  children: ReactNode;
  className?: string;
};

type LinkButtonProps = SharedButtonProps & {
  href?: never;
  to: string;
};

type AnchorButtonProps = SharedButtonProps & {
  href: string;
  to?: never;
};

type NativeButtonProps = SharedButtonProps & {
  disabled?: boolean;
  href?: never;
  onClick?: () => void;
  to?: never;
  type?: "button" | "submit" | "reset";
};

type SecondaryButtonProps = LinkButtonProps | AnchorButtonProps | NativeButtonProps;

export function SecondaryButton(props: SecondaryButtonProps) {
  const className = ["ui-button", "ui-button--secondary", props.className].filter(Boolean).join(" ");

  if ("to" in props && props.to) {
    return (
      <Link className={className} to={props.to}>
        {props.children}
      </Link>
    );
  }

  if ("href" in props && props.href) {
    return (
      <a className={className} href={props.href}>
        {props.children}
      </a>
    );
  }

  const buttonProps = props as NativeButtonProps;

  return (
    <button
      className={className}
      disabled={buttonProps.disabled}
      onClick={buttonProps.onClick}
      type={buttonProps.type ?? "button"}
    >
      {buttonProps.children}
    </button>
  );
}
