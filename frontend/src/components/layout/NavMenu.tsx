// src/components/layout/NavMenu.tsx
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, Menu } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';

import Button from '@/components/ui/Button';
import { useAuth } from '@/context/useAuth';
import { visibleNavItems } from './navItems';

/** Delay before the menu closes, so the pointer can move from the trigger to the menu */
const CLOSE_DELAY_MS = 150;

/** Open state for a menu that opens on hover and closes a moment after the pointer leaves. */
function useHoverMenu() {
    const [isOpen, setIsOpen] = useState(false);
    const closeTimerRef = useRef<number | undefined>(undefined);

    const open = () => {
        window.clearTimeout(closeTimerRef.current);
        setIsOpen(true);
    };

    const scheduleClose = () => {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = window.setTimeout(() => setIsOpen(false), CLOSE_DELAY_MS);
    };

    useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

    return { isOpen, setIsOpen, open, scheduleClose };
}

/** The AutoShift button in the header, and the page menu it opens. */
export default function NavMenu() {
    const { user } = useAuth();
    const { pathname } = useLocation();
    const menu = useHoverMenu();

    return (
        // Non-modal so the page behind stays hoverable and mouse-leave events still fire
        <DropdownMenu.Root dir="rtl" modal={false} open={menu.isOpen} onOpenChange={menu.setIsOpen}>
            <DropdownMenu.Trigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label="תפריט ניווט"
                    onMouseEnter={menu.open}
                    onMouseLeave={menu.scheduleClose}
                    onPointerDown={(e) => {
                        // Mouse users get the menu via hover, so a click shouldn't toggle it closed.
                        // Touch and keyboard keep Radix's default toggle behavior.
                        if (e.pointerType === 'mouse') e.preventDefault();
                    }}
                    className="rounded-md px-2"
                >
                    <Menu size={20} />
                    <span className="text-lg font-bold tracking-wider text-blue-600">AutoShift</span>
                </Button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    align="start"
                    sideOffset={6}
                    onMouseEnter={menu.open}
                    onMouseLeave={menu.scheduleClose}
                    // Don't pull focus back to the trigger when the menu closes on mouse-leave
                    onCloseAutoFocus={(e) => e.preventDefault()}
                    className="z-50 min-w-52 bg-white rounded-lg border border-gray-200 shadow-lg p-1"
                >
                    {visibleNavItems(user).map(({ path, label, icon: Icon }) => {
                        const isActive = pathname === path;
                        return (
                            <DropdownMenu.Item key={path} asChild>
                                <Link
                                    to={path}
                                    aria-current={isActive ? 'page' : undefined}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm outline-none cursor-pointer transition-colors ${
                                        isActive
                                            ? 'bg-blue-50 text-blue-700 font-semibold'
                                            : 'text-gray-700 data-[highlighted]:bg-gray-100'
                                    }`}
                                >
                                    <Icon size={18} />
                                    <span className="flex-1">{label}</span>
                                    {isActive && <Check size={16} />}
                                </Link>
                            </DropdownMenu.Item>
                        );
                    })}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
