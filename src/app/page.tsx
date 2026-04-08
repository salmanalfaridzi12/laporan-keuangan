"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Wallet, Users, TrendingUp, Plus, Trash2, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Transaction = {
  id?: string;
  ref_id: string;
  amount: number;
  date: string;
  category: string;
};

export default function DashboardKeuangan() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [saldoAwal, setSaldoAwal] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    ref_id: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: 'Member Baru',
  });

  const [filterCategory, setFilterCategory] = useState('Semua');
  const [searchRefId, setSearchRefId] = useState('');

  // READ: Load dari Supabase
  useEffect(() => {
    async function fetchData() {
      const { data: transData, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (!transError && transData) setTransactions(transData);

      const { data: setData, error: setError } = await supabase
        .from('settings')
        .select('saldo_awal')
        .eq('id', 'default')
        .single();

      if (!setError && setData) setSaldoAwal(Number(setData.saldo_awal));

      setIsLoaded(true);
    }
    fetchData();
  }, []);

  // UPDATE: Saldo Awal - simpan ke DB saat user selesai mengetik (onBlur)
  const handleUpdateSaldoAwal = async (e: React.FocusEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value) || 0;
    await supabase.from('settings').update({ saldo_awal: val }).eq('id', 'default');
  };

  const formatRupiah = (angka: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);

  const generateNewId = () => {
    if (transactions.length === 0) return '001';
    let maxId = 0;
    transactions.forEach(t => {
      t.ref_id.split(',').forEach(p => {
        const num = parseInt(p.trim(), 10);
        if (!isNaN(num) && num > maxId) maxId = num;
      });
    });
    return String(maxId + 1).padStart(3, '0');
  };

  const dynamicRefIdPlaceholder = useMemo(() => generateNewId(), [transactions]);

  // CREATE: Simpan transaksi baru ke Supabase
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.date) return;
    setIsSaving(true);

    const newRecord = {
      ref_id: formData.ref_id.trim() || dynamicRefIdPlaceholder,
      amount: parseInt(formData.amount.replace(/\D/g, ''), 10),
      date: formData.date,
      category: formData.category,
    };

    const { data, error } = await supabase.from('transactions').insert([newRecord]).select();

    if (!error && data) {
      setTransactions(prev => [data[0], ...prev]);
      setFormData(prev => ({ ...prev, ref_id: '', amount: '' }));
    } else {
      alert('Gagal menyimpan ke database! Cek koneksi & Anon Key.');
    }
    setIsSaving(false);
  };

  // DELETE: Hapus satu baris dari Supabase
  const handleDelete = async (id: string | undefined, ref_id: string) => {
    if (!id) return;
    if (confirm(`Yakin hapus data ID "${ref_id}" dari server?`)) {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (!error) setTransactions(prev => prev.filter(t => t.id !== id));
    }
  };

  // DELETE ALL
  const handleResetAllDatabase = async () => {
    if (confirm('BAHAYA: Yakin kosongkan SELURUH database Supabase? Tidak bisa dibatalkan!')) {
      // Hapus semua baris (dengan memakai kolom id yang selalu ada)
      const { error } = await supabase.from('transactions').delete().gte('amount', 0);
      if (!error) {
        await supabase.from('settings').update({ saldo_awal: 0 }).eq('id', 'default');
        setTransactions([]);
        setSaldoAwal(0);
      }
    }
  };

  const exportToCSV = () => {
    if (transactions.length === 0) return alert('Belum ada data untuk diexport.');
    const headers = ['Ref ID', 'Tanggal', 'Kategori', 'Nominal'];
    const rows = transactions.map(t => [`"${t.ref_id}"`, `"${t.date}"`, `"${t.category}"`, t.amount]);
    const csvContent = 'data:text/csv;charset=utf-8,' + headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Laporan_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const saldoAkhir = useMemo(() =>
    (saldoAwal || 0) + transactions.reduce((sum, t) => sum + t.amount, 0),
    [transactions, saldoAwal]
  );

  const pemasukanBulanIni = useMemo(() => {
    const bln = new Date().getMonth();
    const thn = new Date().getFullYear();
    return transactions
      .filter(t => new Date(t.date).getMonth() === bln && new Date(t.date).getFullYear() === thn)
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  const filteredTransactions = useMemo(() =>
    transactions.filter(t => {
      const matchCat = filterCategory === 'Semua' || t.category === filterCategory;
      const matchId = t.ref_id.toLowerCase().includes(searchRefId.toLowerCase());
      return matchCat && matchId;
    }),
    [transactions, filterCategory, searchRefId]
  );

  const chartData = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      map[d.toLocaleString('id-ID', { month: 'short', year: '2-digit' })] = 0;
    }
    transactions.forEach(t => {
      const key = new Date(t.date).toLocaleString('id-ID', { month: 'short', year: '2-digit' });
      if (map[key] !== undefined) map[key] += t.amount;
    });
    return Object.entries(map).map(([nama, Total]) => ({ nama, Total }));
  }, [transactions]);

  if (!isLoaded) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
      <p className="font-semibold text-slate-500">Menghubungkan ke Database...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800 antialiased selection:bg-purple-200">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard Keuangan</h1>
            <p className="text-slate-500 mt-1">Sistem manajemen kas komunitas · <span className="text-purple-600 font-semibold">Live Database</span></p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-xl shadow-sm border border-slate-200">
              <label className="text-sm font-semibold text-slate-600 whitespace-nowrap">Saldo Awal</label>
              <input
                type="number"
                value={saldoAwal === 0 ? '' : saldoAwal}
                onChange={(e) => setSaldoAwal(parseInt(e.target.value) || 0)}
                onBlur={handleUpdateSaldoAwal}
                className="w-28 text-right font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-purple-500 rounded p-1 text-sm bg-slate-50"
                placeholder="0"
                title="Klik di luar kotak untuk menyimpan ke server"
              />
            </div>
            <button onClick={exportToCSV} className="flex items-center gap-2 bg-white border border-purple-200 hover:bg-purple-50 text-purple-700 font-medium py-2.5 px-4 rounded-xl shadow-sm transition-colors text-sm">
              <Download size={18} />
              <span className="hidden lg:inline">Export CSV</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-purple-100 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex items-center gap-5">
            <div className="p-4 bg-purple-50 text-purple-600 rounded-xl"><Wallet size={28} strokeWidth={2.5} /></div>
            <div>
              <p className="text-sm text-slate-500 font-semibold uppercase tracking-wider mb-1">Saldo Akhir</p>
              <h3 className="text-2xl font-bold text-purple-700">{formatRupiah(saldoAkhir)}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-purple-100 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex items-center gap-5">
            <div className="p-4 bg-violet-50 text-violet-600 rounded-xl"><Users size={28} strokeWidth={2.5} /></div>
            <div>
              <p className="text-sm text-slate-500 font-semibold uppercase tracking-wider mb-1">Total Transaksi</p>
              <h3 className="text-2xl font-bold text-slate-900">{transactions.length} Transaksi</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-purple-100 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex items-center gap-5">
            <div className="p-4 bg-fuchsia-50 text-fuchsia-600 rounded-xl"><TrendingUp size={28} strokeWidth={2.5} /></div>
            <div>
              <p className="text-sm text-slate-500 font-semibold uppercase tracking-wider mb-1">Pemasukan Bulan Ini</p>
              <h3 className="text-2xl font-bold text-slate-900">{formatRupiah(pemasukanBulanIni)}</h3>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Form */}
          <div className="lg:col-span-1 bg-white p-6 md:p-8 rounded-2xl border border-slate-100 shadow-sm md:sticky md:top-8 h-fit">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                <Plus size={20} />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Input Data Kas</h2>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">ID / Referensi</label>
                <input
                  type="text"
                  value={formData.ref_id}
                  onChange={(e) => setFormData({ ...formData, ref_id: e.target.value })}
                  placeholder={`Otomatis: ${dynamicRefIdPlaceholder}`}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-mono text-sm"
                />
                <p className="text-xs text-slate-400 mt-1">Cth input manual: 101,102</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nominal (Rp) *</label>
                <input
                  type="text"
                  required
                  value={formData.amount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    setFormData({ ...formData, amount: raw ? new Intl.NumberFormat('id-ID').format(parseInt(raw, 10)) : '' });
                  }}
                  placeholder="150.000"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Tanggal *</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Kategori *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                  >
                    <option>Member Baru</option>
                    <option>Perpanjangan</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="w-full mt-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-all shadow-sm active:scale-[0.98]"
              >
                {isSaving ? 'Menyimpan...' : 'Simpan ke Cloud ☁️'}
              </button>
            </form>
          </div>

          {/* Chart & Table */}
          <div className="lg:col-span-2 space-y-6">

            {/* Chart */}
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-100 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Tren Pemasukan Bulanan</h2>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="nama" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(val) => `Rp${new Intl.NumberFormat('id-ID', { notation: 'compact' }).format(val)}`} />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value) => [formatRupiah(value as number), 'Pemasukan']}
                    />
                    <Bar dataKey="Total" fill="#9333ea" radius={[6, 6, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-900">Riwayat Transaksi</h2>
                <span className="text-sm font-medium text-purple-600 bg-purple-50 px-3 py-1 rounded-full">{filteredTransactions.length} Data</span>
              </div>

              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Cari Ref ID..."
                    value={searchRefId}
                    onChange={(e) => setSearchRefId(e.target.value)}
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm font-mono"
                  />
                </div>
                <div className="sm:w-48">
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                  >
                    <option value="Semua">Semua Kategori</option>
                    <option>Member Baru</option>
                    <option>Perpanjangan</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-700 text-sm">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Ref ID</th>
                      <th className="px-6 py-4 font-semibold">Tanggal</th>
                      <th className="px-6 py-4 font-semibold">Kategori</th>
                      <th className="px-6 py-4 font-semibold text-right">Nominal</th>
                      <th className="px-6 py-4 font-semibold text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTransactions.length > 0 ? (
                      filteredTransactions.map((t, idx) => (
                        <tr key={t.id ?? idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-mono text-sm text-slate-500">{t.ref_id}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {new Date(t.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${t.category === 'Member Baru' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}>
                              {t.category}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-purple-600">+ {formatRupiah(t.amount)}</td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => handleDelete(t.id, t.ref_id)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Hapus Data"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                          Belum ada data. Mulai tambah transaksi!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>

        {/* Danger Zone */}
        <div className="flex justify-end pt-8 pb-4 border-t border-slate-200 mt-8">
          <button
            onClick={handleResetAllDatabase}
            className="flex items-center gap-2 bg-transparent border border-red-200 hover:bg-red-50 text-red-500 font-medium py-2.5 px-6 rounded-xl transition-colors text-sm opacity-70 hover:opacity-100"
          >
            <Trash2 size={18} />
            Hapus Seluruh Database (Danger Zone)
          </button>
        </div>

      </div>
    </div>
  );
}
