import prisma from '@/lib/db';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { ShieldCheck } from 'lucide-react';
import { AgencyActionButtons } from '@/components/AgencyActionButtons';
import LogoutButton from '@/components/LogoutButton';
import { cookies } from 'next/headers';
import { AgencyCapacityAnalysis } from '@/components/AgencyCapacityAnalysis';
import { getAgencyById } from '@/lib/agencyStore'; // Import from store

export const dynamic = 'force-dynamic';

async function getAgencySession() {
    const cookieStore = await cookies();
    const token = cookieStore.get('fedex_auth_token');
    if (!token) return null;
    try {
        return JSON.parse(token.value);
    } catch {
        return null;
    }
}

async function getAgencyCases(agencyId: string | undefined) {
    if (!agencyId) return [];

    const cases = await prisma.case.findMany({
        where: {
            assignedToId: agencyId, // Strict filtering
        },
        include: { invoice: true },
        orderBy: { aiScore: 'desc' }
    });

    return cases;
}

export default async function AgencyPortalPage() {
    const session = await getAgencySession();
    const agencyId = session?.agencyId;
    const cases = await getAgencyCases(agencyId);

    // Fetch Real Agency Details from Store
    const agencyDetails = agencyId ? getAgencyById(agencyId) : null;

    const currentAgencyName = agencyDetails ? agencyDetails.name : 'Unauthorized View';
    const score = agencyDetails ? agencyDetails.score : 0;
    const history = agencyDetails ? agencyDetails.history : [];

    // Split Cases
    const newAllocations = cases.filter((c: any) => c.status === 'ASSIGNED');
    const activeWork = cases.filter((c: any) => ['WIP', 'PTP', 'DISPUTE'].includes(c.status));

    return (
        <main className="min-h-screen bg-gray-50 p-8">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-800">
                        <ShieldCheck className="text-[var(--color-primary)]" />
                        FedEx Agency Portal
                    </h1>
                    <p className="text-gray-500">Authorized Partner View: {currentAgencyName}</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex gap-4 p-2 bg-white rounded-lg shadow-sm">
                        <div className="text-center px-4 border-r">
                            <span className="block text-2xl font-bold text-gray-800">{cases.length}</span>
                            <span className="text-xs text-gray-500 uppercase">Total Cases</span>
                        </div>
                        <div className="text-center px-4">
                            <span className={`block text-2xl font-bold ${score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-orange-600'}`}>
                                {score}%
                            </span>
                            <span className="text-xs text-gray-500 uppercase">SLA Adherence</span>
                        </div>
                    </div>
                    <LogoutButton />
                </div>
            </header>

            {/* Performance & Capacity Analysis */}
            {agencyId && <AgencyCapacityAnalysis agencyId={agencyId} currentScore={score} history={history} />}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Block 1: New Allocations */}
                <section>
                    <h2 className="text-xl font-bold text-gray-700 mb-4 flex items-center gap-2">
                        <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                        New Allocations
                        <span className="text-sm font-normal text-gray-400 ml-auto">{newAllocations.length} Pending</span>
                    </h2>
                    <div className="space-y-4">
                        {newAllocations.map((c: any) => (
                            <Card key={c.id} className="bg-white border-l-4 border-l-blue-500">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-gray-800">{c.invoice.invoiceNumber}</span>
                                            <Badge variant="warning">NEW OFFER</Badge>
                                        </div>
                                        <p className="text-sm text-gray-500 mt-1">{c.invoice.customerName}</p>
                                    </div>
                                    <span className="text-lg font-bold text-gray-800">${c.invoice.amount.toLocaleString()}</span>
                                </div>
                                <div className="pt-3 border-t flex justify-end">
                                    <AgencyActionButtons caseId={c.id} status={c.status} />
                                </div>
                            </Card>
                        ))}
                        {newAllocations.length === 0 && (
                            <div className="p-8 text-center bg-gray-100 rounded-lg border border-dashed border-gray-300 text-gray-400">
                                No new allocations waiting.
                            </div>
                        )}
                    </div>
                </section>

                {/* Block 2: Accepted / Active Work */}
                <section>
                    <h2 className="text-xl font-bold text-gray-700 mb-4 flex items-center gap-2">
                        <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                        Accepted Cases (WIP)
                        <span className="text-sm font-normal text-gray-400 ml-auto">{activeWork.length} Active</span>
                    </h2>
                    <div className="space-y-4">
                        {activeWork.map((c: any) => (
                            <Card key={c.id} className="bg-white border-l-4 border-l-green-500">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-gray-800">{c.invoice.invoiceNumber}</span>
                                            <Badge variant={c.status === 'PTP' ? 'success' : 'info'}>{c.status}</Badge>
                                        </div>
                                        <p className="text-sm text-gray-500 mt-1">{c.invoice.customerName} | Due: {new Date(c.invoice.dueDate).toLocaleDateString()}</p>
                                    </div>
                                    <span className="text-lg font-bold text-gray-800">${c.invoice.amount.toLocaleString()}</span>
                                </div>
                                <div className="pt-3 border-t flex justify-end">
                                    <AgencyActionButtons caseId={c.id} status={c.status} />
                                </div>
                            </Card>
                        ))}
                        {activeWork.length === 0 && (
                            <div className="p-8 text-center bg-gray-100 rounded-lg border border-dashed border-gray-300 text-gray-400">
                                No active cases. Accept an allocation to start working.
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}
