"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { SiteNav, ArrowIcon } from "@/components/SiteNav";

// Reusable Animation Variants
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

export default function About() {
  return (
    <div className="min-h-screen bg-[#F7F1E5] text-[#111111] font-sans selection:bg-[#D4AF37] selection:text-[#111111]">
      <div className="mx-auto w-full max-w-7xl px-6 pb-24">
        <SiteNav active="About" />

        {/* 1. HERO SECTION */}
        <section className="relative pt-24 pb-20 sm:pt-32 sm:pb-28">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="flex flex-col items-center text-center"
          >
            <motion.div variants={fadeUp} className="mb-6">
              <span className="inline-block rounded-full border border-[#D4AF37]/50 bg-[#D4AF37]/10 px-4 py-1.5 text-xs font-bold tracking-widest text-[#D4AF37] uppercase">
                About Data Agent
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="max-w-4xl text-5xl font-extrabold tracking-tight sm:text-7xl md:text-[5.5rem] leading-[1.1]"
            >
              Making Data Analysis{" "}
              <span className="italic underline decoration-[#D4AF37] decoration-[6px] underline-offset-[8px]">
                Accessible With AI.
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mt-8 max-w-2xl text-lg sm:text-xl text-[#111111]/70 leading-relaxed"
            >
              Data Agent is an AI-powered data analyst that transforms raw datasets into clean data, meaningful insights, visualizations, and machine learning recommendations.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-10 flex flex-col sm:flex-row items-center gap-4">
              <Link
                href="/upload"
                className="flex items-center justify-center rounded-full bg-[#111111] px-8 py-4 text-sm font-semibold text-[#F7F1E5] transition-all hover:bg-[#111111]/80 hover:scale-105"
              >
                Try Data Agent <span className="ml-2">→</span>
              </Link>
              <Link
                href="#features"
                className="flex items-center justify-center rounded-full border border-[#111111]/20 px-8 py-4 text-sm font-semibold text-[#111111] transition-all hover:bg-[#111111]/5"
              >
                Explore Features
              </Link>
            </motion.div>
          </motion.div>

          {/* Hero Visual: AI Ecosystem Illustration */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="mt-20 relative mx-auto w-full max-w-4xl h-[400px] rounded-3xl border border-[#111111]/10 bg-white/40 backdrop-blur-md overflow-hidden flex items-center justify-center"
          >
            {/* Background elements */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.1)_0,transparent_100%)]" />
            
            <div className="relative z-10 w-full px-10 flex flex-col sm:flex-row items-center justify-between gap-6">
              {/* Node 1: Raw Data */}
              <motion.div 
                animate={{ y: [-5, 5, -5] }} 
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="flex flex-col items-center gap-3 z-10"
              >
                <div className="h-16 w-16 rounded-2xl bg-white border border-[#111111]/10 shadow-sm flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-[#111111]/70 uppercase tracking-wider">Raw Dataset</span>
              </motion.div>

              {/* Connector 1 */}
              <div className="hidden sm:block flex-1 h-[2px] bg-gradient-to-r from-[#111111]/10 via-[#D4AF37] to-[#111111]/10 relative overflow-hidden">
                <motion.div 
                  initial={{ x: "-100%" }}
                  animate={{ x: "200%" }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent"
                />
              </div>

              {/* Node 2: AI Core */}
              <motion.div 
                animate={{ scale: [0.95, 1.05, 0.95] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="flex flex-col items-center gap-3 z-10"
              >
                <div className="h-24 w-24 rounded-3xl bg-[#111111] shadow-xl flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-[#D4AF37]/20 blur-xl rounded-full" />
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-[#111111] uppercase tracking-wider">AI Processing Core</span>
                <span className="text-[10px] text-[#111111]/50">Cleaning Engine</span>
              </motion.div>

              {/* Connector 2 */}
              <div className="hidden sm:block flex-1 h-[2px] bg-gradient-to-r from-[#111111]/10 via-[#D4AF37] to-[#111111]/10 relative overflow-hidden">
                <motion.div 
                  initial={{ x: "-100%" }}
                  animate={{ x: "200%" }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: 0.5 }}
                  className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent"
                />
              </div>

              {/* Node 3: Insights */}
              <motion.div 
                animate={{ y: [5, -5, 5] }} 
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="flex flex-col items-center gap-3 z-10"
              >
                <div className="h-16 w-16 rounded-2xl bg-[#D4AF37] shadow-lg flex items-center justify-center text-[#111111]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-[#111111]/70 uppercase tracking-wider">Insights</span>
              </motion.div>
            </div>
          </motion.div>
        </section>

        {/* 2. MISSION SECTION */}
        <motion.section 
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={staggerContainer}
          className="py-20 sm:py-32"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-xl font-bold uppercase tracking-wider text-[#D4AF37] mb-6">Our Mission</h2>
              <blockquote className="text-3xl sm:text-4xl font-medium leading-tight text-[#111111]">
                "Data analysis should not be limited to experts. We believe everyone should be able to understand, clean, and use their data with the power of artificial intelligence."
              </blockquote>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "10x", desc: "Faster Analysis" },
                { label: "AI", desc: "Assisted Cleaning" },
                { label: "Auto", desc: "Generated Insights" },
                { label: "ML", desc: "Recommendations" }
              ].map((stat, i) => (
                <div key={i} className="bg-white/50 border border-[#111111]/5 p-6 rounded-3xl backdrop-blur-sm">
                  <div className="text-3xl font-extrabold text-[#111111]">{stat.label}</div>
                  <div className="text-sm font-medium text-[#111111]/60 mt-1">{stat.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* 3. COMPANY PRINCIPLES */}
        <motion.section 
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={staggerContainer}
          className="py-20 border-t border-[#111111]/10"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                num: "01",
                title: "AI First",
                body: "Using modern AI systems and LLM reasoning to automate complex data workflows.",
                badge: "LLM Powered",
                icon: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              },
              {
                num: "02",
                title: "Built For Everyone",
                body: "Helping students, analysts, researchers, and businesses make better decisions.",
                badge: "Human Centric",
                icon: <><circle cx="12" cy="7" r="4"/><path d="M18 21v-2a4 4 0 0 0-4-4H10a4 4 0 0 0-4 4v2"/></>
              },
              {
                num: "03",
                title: "Privacy Focused",
                body: "Your data remains secure and processed with strong privacy principles.",
                badge: "Local First Ready",
                icon: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>
              }
            ].map((principle) => (
              <motion.div 
                key={principle.num}
                whileHover={{ y: -8 }}
                className="group relative bg-white p-8 rounded-3xl shadow-sm border border-[#111111]/5 transition-all hover:shadow-xl hover:shadow-[#D4AF37]/5"
              >
                <div className="flex justify-between items-start mb-12">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F7F1E5] text-[#111111]">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {principle.icon}
                    </svg>
                  </span>
                  <span className="text-4xl font-black text-[#111111]/5 group-hover:text-[#D4AF37]/20 transition-colors">{principle.num}</span>
                </div>
                <h3 className="text-xl font-bold text-[#111111]">{principle.title}</h3>
                <p className="mt-3 text-sm text-[#111111]/70 leading-relaxed mb-6">{principle.body}</p>
                <span className="inline-block rounded-md bg-[#111111]/5 px-2.5 py-1 text-xs font-semibold text-[#111111]/60">
                  {principle.badge}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* 4. ARCHITECTURE SECTION (DARK MODE) */}
        <motion.section 
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeUp}
          className="py-10"
        >
          <div className="bg-[#111111] rounded-[2.5rem] p-10 sm:p-16 text-[#F7F1E5] shadow-2xl relative overflow-hidden">
            {/* Dark background subtle glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#D4AF37] opacity-[0.03] blur-[100px] rounded-full" />
            
            <div className="relative z-10 flex flex-col lg:flex-row gap-16">
              <div className="lg:w-1/3">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">Powered By Modern AI Architecture</h2>
                <p className="text-[#F7F1E5]/60 text-lg leading-relaxed mb-8">
                  A high-performance pipeline designed to reason, process, and analyze your data securely at scale.
                </p>
                
                <div className="flex flex-wrap gap-3">
                  {[
                    "Next.js + TypeScript", 
                    "FastAPI + Python", 
                    "LangGraph + LLM Router", 
                    "Pandas + ML Pipeline"
                  ].map((tech, idx) => (
                    <span key={idx} className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-medium tracking-wide">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>

              {/* Pipeline Visual */}
              <div className="lg:w-2/3 flex flex-col gap-4">
                {[
                  { step: "1", title: "Dataset Upload", desc: "Secure ingestion of CSV, Excel, or JSON data." },
                  { step: "2", title: "Data Profiler", desc: "Automatic detection of types, anomalies, and structure." },
                  { step: "3", title: "AI Reasoning Layer", desc: "LLM determines optimal cleaning & analysis strategy." },
                  { step: "4", title: "Cleaning Engine & Viz Generator", desc: "Executes Python code to clean and plot data." },
                  { step: "5", title: "ML Recommendation System", desc: "Suggests predictive models based on cleaned dataset." }
                ].map((item, index) => (
                  <div key={index} className="flex items-start gap-6 bg-white/[0.03] border border-white/5 p-5 rounded-2xl relative">
                    {index !== 4 && <div className="absolute left-8 top-14 w-[2px] h-6 bg-white/10" />}
                    <div className="w-6 h-6 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#D4AF37] flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">{item.title}</h4>
                      <p className="text-sm text-white/50 mt-1">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        {/* 5. WHY WE BUILT IT & 6. TRUST SECTION */}
        <section className="py-20 grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Why We Built It */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-3xl font-bold mb-6">Why Data Agent Exists</h2>
            <p className="text-[#111111]/70 mb-10 text-lg">
              Most people have valuable data but struggle with cleaning, understanding, and analyzing it. Data Agent bridges the gap between raw information and actionable intelligence.
            </p>
            
            <div className="flex flex-col gap-6">
              <div className="bg-red-50/50 border border-red-100 rounded-2xl p-6">
                <h4 className="text-sm font-bold text-red-800 uppercase tracking-wider mb-4">Before Data Agent</h4>
                <ul className="space-y-3">
                  {["Manual, tedious cleaning", "Complex fragmented tools", "Time consuming analysis", "Requires deep technical expertise"].map((item, i) => (
                    <li key={i} className="flex items-center text-sm text-red-900/70 gap-3">
                      <span className="text-red-500">❌</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-2xl p-6">
                <h4 className="text-sm font-bold text-[#9A7B20] uppercase tracking-wider mb-4">With Data Agent</h4>
                <ul className="space-y-3">
                  {["AI-powered automated workflow", "Instant automatic cleaning", "Generated actionable insights", "Guided ML recommendations"].map((item, i) => (
                    <li key={i} className="flex items-center text-sm text-[#111111]/80 gap-3 font-medium">
                      <span className="text-[#D4AF37]">✓</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>

          {/* Trust Section */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="flex flex-col justify-center">
            <h2 className="text-3xl font-bold mb-6">Built With Transparency</h2>
            <p className="text-[#111111]/70 mb-10 text-lg">
              Data Agent focuses on responsible AI usage, predictable workflows, and user-controlled data.
            </p>
            
            <div className="space-y-8">
              {[
                { title: "Privacy First", desc: "We don't train our public models on your proprietary datasets." },
                { title: "Secure Processing", desc: "Data is processed in isolated, ephemeral environments." },
                { title: "Reliable AI Pipeline", desc: "Traceable reasoning logs so you understand every decision the AI makes." }
              ].map((trust, idx) => (
                <div key={idx} className="flex gap-4">
                  <div className="mt-1 h-2 w-2 rounded-full bg-[#D4AF37] shrink-0" />
                  <div>
                    <h4 className="font-bold text-[#111111]">{trust.title}</h4>
                    <p className="text-[#111111]/60 text-sm mt-1">{trust.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* 7. FINAL CTA */}
        <motion.section 
          initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
          className="mt-10"
        >
          <div className="relative overflow-hidden bg-[#111111] rounded-[2rem] px-6 py-20 text-center sm:px-16 flex flex-col items-center">
            {/* Background effects */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#D4AF37] opacity-[0.05] blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 pointer-events-none mix-blend-overlay" />

            <div className="relative z-10 max-w-2xl">
              <h2 className="text-4xl sm:text-5xl font-bold text-[#F7F1E5] tracking-tight mb-6">
                Ready to discover what your data can reveal?
              </h2>
              <p className="text-lg text-[#F7F1E5]/70 mb-10">
                Upload your dataset today and let our AI transform raw numbers into strategic insights.
              </p>
              
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link
                  href="/upload"
                  className="flex items-center justify-center rounded-full bg-[#D4AF37] px-8 py-4 text-sm font-bold text-[#111111] transition-all hover:bg-[#F7F1E5] hover:scale-105"
                >
                  Start Analysis
                </Link>
                <Link
                  href="/contact"
                  className="flex items-center justify-center rounded-full border border-white/20 px-8 py-4 text-sm font-bold text-[#F7F1E5] transition-all hover:bg-white/10"
                >
                  Learn More
                </Link>
              </div>
            </div>
          </div>
        </motion.section>

      </div>
    </div>
  );
}