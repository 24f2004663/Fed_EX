'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, Lock, ArrowRight, Eye, EyeOff, ChevronDown, Search } from 'lucide-react';
import { loginUser } from '@/app/auth-actions';
import { getAgenciesAction } from '@/app/agency/actions'; // Fetch from store
import clsx from 'clsx';

interface Agency {
    id: string;
    name: string;
    score: number;
}

export default function LoginPage() {
    const router = useRouter();
    const [role, setRole] = useState<'ENTERPRISE' | 'AGENCY'>('ENTERPRISE');

    // Dynamic Agency State
    const [availableAgencies, setAvailableAgencies] = useState<Agency[]>([]);
    const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);

    const [showPassword, setShowPassword] = useState(false);

    // Custom Dropdown State
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Fetch Agencies on Load
    useEffect(() => {
        const fetchAgencies = async () => {
            try {
                const data = await getAgenciesAction();
                setAvailableAgencies(data);
                // Select first one by default if available
                if (data.length > 0) {
                    setSelectedAgency(data[0]);
                }
            } catch (error) {
                console.error("Failed to fetch agencies for login", error);
            }
        };
        fetchAgencies();
    }, []);

    const filteredAgencies = availableAgencies.filter(a =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        const agencyId = role === 'AGENCY' && selectedAgency ? selectedAgency.id : undefined;

        // Call Server Action to set Cookie
        const result = await loginUser(role, agencyId);

        if (result.success) {
            if (role === 'ENTERPRISE') {
                router.push('/');
            } else {
                router.push('/agency');
            }
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-[var(--color-primary-dark)] p-4 relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                <div className="absolute top-10 left-10 w-64 h-64 bg-purple-500 rounded-full blur-[100px]"></div>
                <div className="absolute bottom-10 right-10 w-96 h-96 bg-orange-500 rounded-full blur-[120px]"></div>
            </div>

            <div className="glass-panel bg-white/95 p-8 max-w-lg w-full shadow-2xl z-10 transition-all duration-300">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-[var(--color-primary)]">FedEx Recovery</h1>
                    <p className="text-gray-500 mt-2 text-sm">Secure Collections Gateway</p>
                </div>

                {/* Role Switcher */}
                <div className="flex p-1 bg-gray-100 rounded-lg mb-8">
                    <button
                        onClick={() => setRole('ENTERPRISE')}
                        className={clsx(
                            "flex-1 py-2 text-sm font-medium rounded-md transition-all",
                            role === 'ENTERPRISE' ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        Enterprise Admin
                    </button>
                    <button
                        onClick={() => setRole('AGENCY')}
                        className={clsx(
                            "flex-1 py-2 text-sm font-medium rounded-md transition-all",
                            role === 'AGENCY' ? "bg-white text-[var(--color-secondary)] shadow-sm" : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        Agency Partner
                    </button>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">

                    {/* Custom Searchable Dropdown (Agency Role Only) */}
                    {role === 'AGENCY' && (
                        <div className="relative mb-6" ref={dropdownRef}>
                            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Select Agency</label>

                            {/* Trigger Button */}
                            <button
                                type="button"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="w-full pl-4 pr-10 py-3 bg-orange-50 border border-orange-200 rounded-lg text-[var(--color-secondary)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] text-left flex items-center justify-between transition-all"
                            >
                                <span>{selectedAgency ? selectedAgency.name : 'Select Agency...'}</span>
                                <ChevronDown className={clsx("w-5 h-5 text-orange-400 transition-transform", isDropdownOpen && "rotate-180")} />
                            </button>

                            {/* Dropdown Menu */}
                            {isDropdownOpen && (
                                <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                                    {/* Search Bar */}
                                    <div className="p-2 border-b border-gray-100 bg-gray-50 sticky top-0">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                placeholder="Search agency..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-md focus:outline-none focus:border-[var(--color-secondary)]"
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    {/* Options List */}
                                    <div className="max-h-48 overflow-y-auto">
                                        {filteredAgencies.length > 0 ? (
                                            filteredAgencies.map((a) => (
                                                <button
                                                    key={a.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedAgency(a);
                                                        setIsDropdownOpen(false);
                                                        setSearchQuery('');
                                                    }}
                                                    className={clsx(
                                                        "w-full text-left px-4 py-3 hover:bg-orange-50 text-sm transition-colors flex items-center gap-2",
                                                        selectedAgency?.id === a.id ? "text-[var(--color-secondary)] font-bold bg-orange-50/50" : "text-gray-600"
                                                    )}
                                                >
                                                    {a.name}
                                                </button>
                                            ))
                                        ) : (
                                            <div className="p-4 text-center text-gray-400 text-sm">No results found</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-4">

                        {/* Username Field - Only shown for ENTERPRISE */}
                        {role === 'ENTERPRISE' && (
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-500 uppercase">Username</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        readOnly
                                        value="admin"
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-gray-700 font-mono"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Password Field */}
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-500 uppercase">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    readOnly
                                    value={role === 'ENTERPRISE' ? "admin@123" : "demo@123"}
                                    className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-gray-700 font-mono"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className={clsx(
                            "w-full py-4 rounded-lg text-white font-bold text-lg shadow-lg hover:opacity-90 transition flex items-center justify-center gap-2",
                            role === 'ENTERPRISE' ? "bg-[var(--color-primary)]" : "bg-[var(--color-secondary)]"
                        )}
                    >
                        Login to Dashboard
                        <ArrowRight className="w-5 h-5" />
                    </button>

                    <p className="text-center text-xs text-gray-400">
                        FedEx Internal Use Only • v1.4.0 • {role === 'ENTERPRISE' ? 'SSO Enabled' : 'Partner Network'}
                    </p>
                </form>
            </div>
        </main>
    );
}
