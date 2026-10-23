"use client";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { setShowName } from "@/actions/settings";

export function ShowNameSwitch({ show }: { show: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [on, setOn] = useOptimistic(show);
  return (
    <div className="toggle">
      <div id="sn">Show my name when I&apos;m in<small>Off: you still count, listed as &quot;+1 anonymous&quot;</small></div>
      <button
        role="switch"
        aria-checked={on}
        aria-labelledby="sn"
        className={`sw${on ? " on" : ""}`}
        onClick={() =>
          start(async () => {
            setOn(!on);
            await setShowName({ show: !on });
            router.refresh();
          })
        }
      >
        <i />
      </button>
    </div>
  );
}
