"use client"

import {
  CheckCircle,
  Info,
  SpinnerGap,
  Warning,
  XCircle,
} from "@phosphor-icons/react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "!border-[#34343a] !bg-[#1b1b1f] !text-zinc-100",
          title: "!text-zinc-100",
          description: "!text-zinc-300",
          actionButton: "!bg-[#6cef4b] !text-[#10250a]",
          cancelButton: "!bg-[#29292d] !text-zinc-200",
          closeButton: "!border-[#45454c] !bg-[#242428] !text-zinc-100",
        },
      }}
      icons={{
        success: <CheckCircle size={16} weight="fill" className="size-4" />,
        info: <Info size={16} weight="fill" className="size-4" />,
        warning: <Warning size={16} weight="fill" className="size-4" />,
        error: <XCircle size={16} weight="fill" className="size-4" />,
        loading: <SpinnerGap size={16} weight="fill" className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "#1b1b1f",
          "--normal-text": "#f4f4f5",
          "--normal-border": "#34343a",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
