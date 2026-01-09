import ImportDropdown from '@/components/ImportDropdown';
import LogoutButton from '@/components/LogoutButton';
import prisma from '@/lib/db';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { DollarSign, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { HistoricalPerformanceGraph } from '@/components/HistoricalPerformanceGraph';

async function getDashboardData() {
  // Fetch Data (simulating "Agency Daemon" & "Scoring Service" output)
  const cases = await prisma.case.findMany({
    include: {
      invoice: true,
      assignedTo: true // Fetch assigned agency details
    },
    orderBy: { aiScore: 'desc' },
    take: 20
  });

  const totalAmount = await prisma.invoice.aggregate({
    _sum: { amount: true }
  });

  const highPriorityCount = await prisma.case.count({
    where: { priority: 'HIGH' }
  });

  // Calculate Metrics
  const recoveryRate = 68; // Mocked for demo
  const avgDSO = 42; // Mocked for demo

  return { cases, totalAmount, highPriorityCount, recoveryRate, avgDSO };
}

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('fedex_auth_token');

  if (!token) {
    redirect('/login');
  }

  const { cases, totalAmount, highPriorityCount, recoveryRate, avgDSO } = await getDashboardData();

  // Optional: Check role if needed, but existence is sufficient for "prerequisite" requirement
  try {
    const session = JSON.parse(token.value);
    // If Agency tries to access Manager Dashboard, maybe redirect to /agency? 
    // User requested "login must be prerequisites". 
    // If we are stricter:
    if (session.role === 'AGENCY') {
      redirect('/agency');
    }
  } catch {
    redirect('/login');
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      {/* 1. Header with Import Action */}
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-primary)]">FedEx Smart Recovery</h1>
          <p className="text-gray-500">AI-Driven Debt Collections Command Center</p>
        </div>
        <div className="flex gap-4">
          <ImportDropdown />
          <LogoutButton />
        </div>
      </header>

      {/* 2. KPI Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-lg text-[var(--color-primary)]">
              <span className="font-bold text-lg">$</span>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Total Exposure</p>
              <h3 className="text-2xl font-bold text-gray-800">${totalAmount._sum.amount?.toLocaleString() ?? '0'}</h3>
              <p className="text-xs text-green-600 mt-1">+12% vs last month</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-100 rounded-lg text-red-600">
              <span className="font-bold text-lg">!</span>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">High Priority Cases</p>
              <h3 className="text-2xl font-bold text-red-600">{highPriorityCount}</h3>
              <p className="text-xs text-red-500 mt-1">Requires Immediate Action</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg text-green-600">
              <span className="font-bold text-lg">✔</span>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Recovery Rate</p>
              <h3 className="text-2xl font-bold text-green-600">{recoveryRate}%</h3>
              <p className="text-xs text-green-500 mt-1">Target: 65%</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
              <span className="font-bold text-lg">🕒</span>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Avg DSO</p>
              <h3 className="text-2xl font-bold text-gray-800">{avgDSO} Days</h3>
              <p className="text-xs text-blue-500 mt-1">-3 days improvement</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 3. Live Activity Monitor (Moved Up) */}
      <h2 className="text-lg font-bold text-gray-800 mb-4">Live Activity Monitor</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Agency Performance */}
        <Card>
          <h3 className="text-sm font-bold text-[var(--color-secondary)] mb-4">Agency Performance</h3>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span>Alpha Collections</span>
              <span className="font-bold text-green-600">92%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Beta Recovery</span>
              <span className="font-bold text-yellow-600">78%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Gamma Partners</span>
              <span className="font-bold text-orange-600">60%</span>
            </div>
          </div>
        </Card>

        {/* SLA Breaches */}
        <Card>
          <h3 className="text-sm font-bold text-[var(--color-primary)] mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            SLA Breaches
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-2 bg-red-50 rounded border border-red-100">
              <span className="text-xs font-medium text-gray-700">INV-2025-001</span>
              <span className="text-xs font-bold text-red-600">-2h</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-orange-50 rounded border border-orange-100">
              <span className="text-xs font-medium text-gray-700">INV-9092-22</span>
              <span className="text-xs font-bold text-orange-600">Warning</span>
            </div>
          </div>
        </Card>
      </div>

      {/* 4. Main Content: Full Width Table */}
      <div className="mb-8">
        <Card className="h-full">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-800">Intelligent Priority Queue</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase border-b">
                  <th className="pb-3 pl-4">Invoice</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Days Overdue</th>
                  <th className="pb-3">Agency</th>
                  <th className="pb-3">AI Score</th>
                  <th className="pb-3">Priority</th>
                  <th className="pb-3 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cases.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="py-4 pl-4 text-sm font-medium text-gray-800">{c.invoice.invoiceNumber}</td>
                    <td className="py-4 text-sm text-gray-600">${c.invoice.amount.toLocaleString()}</td>
                    <td className="py-4 text-sm text-gray-500">38d</td>

                    {/* New Agency Column */}
                    <td className="py-4 text-sm">
                      {c.status === 'QUEUED' || !c.assignedTo ? (
                        <span className="text-gray-400 italic">TBD</span>
                      ) : (
                        <span className="text-gray-700 font-medium">{c.assignedTo.name}</span>
                      )}
                    </td>

                    <td className="py-4 w-48">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--color-primary)] rounded-full"
                            style={{ width: `${c.aiScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-gray-600">{c.aiScore}/100</span>
                      </div>
                    </td>
                    <td className="py-4">
                      <Badge variant={c.priority === 'HIGH' ? 'danger' : c.priority === 'MEDIUM' ? 'warning' : 'success'}>
                        {c.priority}
                      </Badge>
                    </td>
                    <td className="py-4 pr-4">
                      <span className="text-xs text-gray-500 capitalize">{c.status.toLowerCase()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 5. Historical Stats */}
      <div className="mb-8">
        <HistoricalPerformanceGraph />
      </div>
    </main>
  );
}
