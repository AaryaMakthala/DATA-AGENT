"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";

import { SiteNav, ArrowIcon, SparkleIcon } from "@/components/SiteNav";

// --- DATA STRUCTURES ---

const FEATURES = [
  {
    num: "01",
    title: "AI-Powered Data Cleaning",
    body: "Automatically detect missing values, duplicates, outliers, and inconsistencies in seconds. Say goodbye to manual data scrubbing.",
    tags: ["Missing Values", "Duplicate Detection", "Outlier Handling", "Data Validation"],
    Visual: () => (
      <div className="relative h-full w-full rounded-2xl bg-white/40 p-6 shadow-sm backdrop-blur-sm border border-ink/5 overflow-hidden flex flex-col justify-center gap-4">
        <div className="text-xs font-mono text-muted mb-2 uppercase tracking-wider">Dataset.csv</div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex gap-2 w-full">
            <div className="h-6 w-1/4 bg-ink/5 rounded-md" />
            <motion.div 
              className="h-6 w-1/4 rounded-md"
              animate={{ 
                backgroundColor: ["#fee2e2", "#fef08a", "#dcfce7", "#dcfce7"],
                opacity: [0.7, 1, 1, 0.7]
              }}
              transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }}
            />
            <div className="h-6 w-1/2 bg-ink/5 rounded-md" />
          </div>
        ))}
        <motion.div 
          className="absolute right-8 top-1/2 -translate-y-1/2 bg-ink text-cream px-3 py-1 rounded-full text-xs font-bold shadow-lg"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          Cleaned ✓
        </motion.div>
      </div>
    ),
  },
  {
    num: "02",
    title: "Intelligent Data Quality Analysis",
    body: "Understand your dataset's health before processing. Get a comprehensive overview of schema, distributions, and potential errors.",
    tags: ["Pandas Profiling", "Schema Detection", "Validation Engine"],
    Visual: () => (
      <div className="relative h-full w-full rounded-2xl bg-white/40 p-6 shadow-sm backdrop-blur-sm border border-ink/5 flex items-center justify-center">
        <div className="grid grid-cols-2 gap-4 w-full">
          <div className="col-span-2 flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-ink/5">
            <div>
              <div className="text-sm font-bold text-ink">Completeness Score</div>
              <div className="text-xs text-muted">Across all columns</div>
            </div>
            <motion.div 
              className="text-2xl font-display font-bold text-mustard"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              98.5%
            </motion.div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-ink/5 flex flex-col gap-2">
             <div className="text-xs font-bold text-ink">Data Types</div>
             <div className="flex gap-1 h-2 w-full rounded-full overflow-hidden">
                <div className="bg-mustard w-1/2" />
                <div className="bg-ink w-1/3" />
                <div className="bg-ink/20 w-1/6" />
             </div>
             <div className="text-[10px] text-muted mt-1">Num • Cat • Text</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-ink/5 flex flex-col gap-2 justify-center">
             <div className="text-xs font-bold text-ink">Anomalies Detected</div>
             <div className="text-lg font-bold text-red-500">3</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    num: "03",
    title: "AI-Powered Analysis",
    body: "Discover hidden trends and patterns using cutting-edge LLM reasoning. Ask questions in plain English and get deep analytical insights.",
    tags: ["Gemini", "Groq", "LangGraph", "AI Agents"],
    Visual: () => (
      <div className="relative h-full w-full rounded-2xl bg-white/40 p-6 shadow-sm backdrop-blur-sm border border-ink/5 flex flex-col gap-4 justify-center">
        <motion.div 
          className="self-end bg-mustard/20 border border-mustard text-ink text-sm py-2 px-4 rounded-2xl rounded-tr-sm max-w-[80%]"
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          What's driving the revenue drop in Q3?
        </motion.div>
        <motion.div 
          className="self-start bg-white border border-ink/5 text-ink text-sm py-3 px-4 rounded-2xl rounded-tl-sm shadow-sm max-w-[90%]"
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-2 text-xs font-bold text-mustard">
            <SparkleIcon className="w-3 h-3" /> AI Analysis
          </div>
          Based on the dataset, Q3 revenue drop strongly correlates with a 42% decrease in European user retention during August.
        </motion.div>
      </div>
    ),
  },
  {
    num: "04",
    title: "Automated Visualization",
    body: "Generate meaningful, presentation-ready charts automatically. We pick the right visualization type for your specific data distributions.",
    tags: ["Matplotlib", "Plotly", "Automated Charts"],
    Visual: () => (
      <div className="relative h-full w-full rounded-2xl bg-white/40 p-6 shadow-sm backdrop-blur-sm border border-ink/5 flex items-end justify-center gap-3">
        {[40, 75, 45, 90, 60, 110].map((height, i) => (
          <motion.div
            key={i}
            className="w-10 rounded-t-md bg-gradient-to-t from-mustard/40 to-mustard"
            initial={{ height: 0 }}
            whileInView={{ height: `${height}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
          />
        ))}
      </div>
    ),
  },
  {
    num: "05",
    title: "Machine Learning Recommendations",
    body: "Not sure which model to use? Data Agent recommends and outlines suitable machine learning algorithms based on your dataset's unique characteristics.",
    tags: ["ML Pipeline", "Model Selection", "Scoring"],
    Visual: () => (
      <div className="relative h-full w-full rounded-2xl bg-white/40 p-6 shadow-sm backdrop-blur-sm border border-ink/5 flex flex-col justify-center items-center gap-6">
         <div className="bg-ink text-cream text-xs font-bold px-4 py-2 rounded-lg">Target: Customer Churn</div>
         <div className="flex gap-4">
            <motion.div 
              className="flex flex-col items-center gap-2"
              whileHover={{ y: -5 }}
            >
               <div className="h-16 w-16 rounded-xl bg-white border-2 border-mustard flex items-center justify-center shadow-sm">
                 <span className="text-xl font-bold text-ink">92%</span>
               </div>
               <span className="text-xs font-medium text-ink">Random Forest</span>
            </motion.div>
            <motion.div 
              className="flex flex-col items-center gap-2 opacity-60"
              whileHover={{ y: -5, opacity: 1 }}
            >
               <div className="h-16 w-16 rounded-xl bg-white border border-ink/10 flex items-center justify-center shadow-sm">
                 <span className="text-xl font-bold text-ink">87%</span>
               </div>
               <span className="text-xs font-medium text-ink">Log Reg</span>
            </motion.div>
            <motion.div 
              className="flex flex-col items-center gap-2 opacity-60"
              whileHover={{ y: -5, opacity: 1 }}
            >
               <div className="h-16 w-16 rounded-xl bg-white border border-ink/10 flex items-center justify-center shadow-sm">
                 <span className="text-xl font-bold text-ink">85%</span>
               </div>
               <span className="text-xs font-medium text-ink">XGBoost</span>
            </motion.div>
         </div>
      </div>
    ),
  },
  {
    num: "06",
    title: "Secure Data Processing",
    body: "Enterprise-grade security built-in. Your datasets stay private, processed in isolated environments, and are never shared with third parties.",
    tags: ["Local Processing", "Privacy First", "Secure Pipeline"],
    Visual: () => (
      <div className="relative h-full w-full rounded-2xl bg-white/40 p-6 shadow-sm backdrop-blur-sm border border-ink/5 flex items-center justify-center">
        <div className="relative">
          <motion.div 
            className="absolute inset-0 border-2 border-mustard rounded-full"
            animate={{ scale: [1, 1.5], opacity: [1, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <div className="h-20 w-20 bg-ink rounded-full flex items-center justify-center shadow-lg relative z-10">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F7F1E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
        </div>
      </div>
    ),
  },
];

const ARCHITECTURE = [
  {
    layer: "Frontend",
    tech: "Next.js + TypeScript",
    desc: "Lightning-fast, highly responsive user interface built on modern web standards.",
  },
  {
    layer: "Backend",
    tech: "FastAPI + Python",
    desc: "High-performance API layer capable of handling massive dataset streams.",
  },
  {
    layer: "AI Layer",
    tech: "LangGraph + LLM Routing",
    desc: "Intelligent agent orchestration routing queries to the most capable models.",
  },
  {
    layer: "Data Engine",
    tech: "Pandas + ML Pipeline",
    desc: "Robust numerical processing and scalable machine learning transformations.",
  },
];

// --- COMPONENTS ---

export default function Features() {
  const containerRef = useRef(null);

  return (
    <div className="min-h-screen bg-cream text-ink font-sans selection:bg-mustard/30 relative overflow-hidden" ref={containerRef}>
      
      {/* Background Noise/Texture */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>

      <div className="mx-auto w-full max-w-7xl px-6 relative z-10">
        <SiteNav active="Features" />

        {/* HERO SECTION */}
        <section className="pt-24 pb-20 md:pt-32 md:pb-32 flex flex-col lg:flex-row items-center gap-12">
          <motion.div 
            className="flex-1 flex flex-col items-start text-left"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-2 rounded-full border border-ink/10 bg-white/50 backdrop-blur-md px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-ink mb-6 shadow-sm">
              <SparkleIcon className="h-3 w-3 text-mustard" />
              Powerful AI Data Engine
            </div>
            
            <h1 className="display-heading text-5xl sm:text-6xl lg:text-7xl leading-[1.1] tracking-tight">
              Turn Messy Data Into <br className="hidden lg:block"/>
              <span className="relative whitespace-nowrap">
                <span className="relative z-10">Intelligent Decisions</span>
                <span className="absolute left-0 bottom-1 w-full h-[30%] bg-mustard/80 -z-10 -rotate-1 transform origin-left"></span>
              </span>
            </h1>
            
            <p className="mt-6 text-lg text-muted max-w-xl leading-relaxed">
              Data Agent automatically cleans datasets, discovers patterns, generates visual insights, and recommends machine learning approaches using advanced AI.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
              <Link href="/upload" className="w-full sm:w-auto px-8 py-4 bg-ink text-cream rounded-full font-bold text-base hover:bg-ink/90 shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-2 group">
                Analyze Your Data 
                <ArrowIcon className="transform group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="#workflow" className="w-full sm:w-auto px-8 py-4 bg-transparent text-ink border-2 border-ink/10 rounded-full font-bold text-base hover:border-ink/30 transition-all duration-300 flex items-center justify-center">
                Explore Workflow
              </Link>
            </div>
          </motion.div>

          {/* Hero Visual Animation */}
          <motion.div 
            className="flex-1 relative w-full aspect-square max-w-[500px] hidden md:block"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="absolute inset-0 bg-white/30 rounded-full blur-3xl mix-blend-overlay"></div>
            
            {/* Center AI Core */}
            <motion.div 
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-ink rounded-3xl flex items-center justify-center shadow-2xl z-20"
              animate={{ rotate: 360 }}
              transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
            >
              <SparkleIcon className="text-mustard w-12 h-12" />
            </motion.div>

            {/* Orbiting Nodes */}
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute left-1/2 top-1/2 w-[300px] h-[300px] border border-ink/10 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ rotate: i * 60 }}
              >
                <motion.div 
                  className="absolute top-0 left-1/2 w-4 h-4 bg-mustard rounded-full -translate-x-1/2 -translate-y-1/2 shadow-lg"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10 + i * 5, repeat: Infinity, ease: "linear" }}
                  style={{ transformOrigin: "0 150px" }}
                />
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* FEATURE SHOWCASE (Alternating) */}
        <section id="workflow" className="py-24 flex flex-col gap-32">
          {FEATURES.map((feature, idx) => {
            const isEven = idx % 2 === 0;
            return (
              <motion.div 
                key={feature.num}
                className={`flex flex-col lg:flex-row items-center gap-12 lg:gap-24 ${isEven ? "" : "lg:flex-row-reverse"}`}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6 }}
              >
                {/* Text Side */}
                <div className="flex-1 w-full flex flex-col gap-6">
                  <div className="font-mono text-5xl font-bold text-ink/10 -mb-4 tracking-tighter">
                    {feature.num}
                  </div>
                  <h2 className="display-heading text-3xl md:text-4xl font-bold text-ink leading-tight">
                    {feature.title}
                  </h2>
                  <p className="text-lg text-muted leading-relaxed">
                    {feature.body}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {feature.tags.map((tag) => (
                      <span key={tag} className="px-3 py-1 bg-white border border-ink/5 rounded-md text-xs font-medium text-ink shadow-sm">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Visual Side */}
                <div className="flex-1 w-full aspect-[4/3] lg:aspect-square max-h-[400px] relative">
                  {/* Decorative background blob */}
                  <div className={`absolute inset-0 bg-mustard/20 blur-3xl rounded-full scale-75 transform ${isEven ? "translate-x-8" : "-translate-x-8"}`}></div>
                  <feature.Visual />
                </div>
              </motion.div>
            )
          })}
        </section>

      </div>

      {/* ARCHITECTURE SECTION (Dark Mode) */}
      <section className="bg-ink py-32 mt-24 relative z-0">
        {/* Subtle grid background */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.05]" 
             style={{ backgroundImage: 'linear-gradient(rgba(247, 241, 229, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(247, 241, 229, 0.2) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
        </div>

        <div className="mx-auto w-full max-w-6xl px-6 relative z-10">
          <div className="text-center mb-20 flex flex-col items-center">
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-bold uppercase tracking-widest text-mustard mb-4 shadow-sm backdrop-blur-sm">
              Under The Hood
            </span>
            <h2 className="display-heading text-4xl md:text-5xl font-bold text-cream">
              Built With Modern AI Architecture
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {ARCHITECTURE.map((item, idx) => (
              <motion.div 
                key={item.layer}
                className="bg-white/5 border border-white/10 p-8 rounded-2xl backdrop-blur-md hover:bg-white/10 hover:border-mustard/50 transition-colors duration-300 flex flex-col h-full"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
              >
                <div className="text-mustard text-sm font-mono font-bold mb-2 uppercase tracking-wide">
                  {item.layer}
                </div>
                <div className="text-xl font-bold text-cream mb-4">
                  {item.tech}
                </div>
                <p className="text-sm text-cream/60 leading-relaxed mt-auto">
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARISON SECTION */}
      <section className="py-32 bg-white relative z-10">
        <div className="mx-auto w-full max-w-5xl px-6">
          <div className="text-center mb-16">
            <h2 className="display-heading text-4xl md:text-5xl font-bold text-ink">
              Why Data Agent?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            {/* Traditional */}
            <div className="bg-cream p-8 rounded-3xl border border-ink/5">
              <h3 className="text-xl font-bold text-ink/50 mb-8 pb-4 border-b border-ink/10">Traditional Data Analysis</h3>
              <ul className="space-y-6">
                {["Manual data cleaning using scripts", "Time consuming and error-prone", "Requires deep technical expertise", "Static, rigid PDF reports"].map((item, i) => (
                  <li key={i} className="flex items-start gap-4 text-ink/70">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-red-500 text-sm mt-0.5">✕</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Data Agent */}
            <div className="bg-ink p-8 rounded-3xl border border-ink/10 shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-mustard/10 blur-3xl rounded-full"></div>
              <h3 className="text-xl font-bold text-cream mb-8 pb-4 border-b border-white/10 relative z-10">Data Agent AI</h3>
              <ul className="space-y-6 relative z-10">
                {["Automated, AI-powered cleaning", "Instant processing & insights", "Zero coding required", "Interactive visualizations & ML"].map((item, i) => (
                  <li key={i} className="flex items-start gap-4 text-cream">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-mustard flex items-center justify-center text-ink text-sm mt-0.5 font-bold">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA SECTION */}
      <section className="py-32 relative z-10 overflow-hidden">
        {/* Background ambient glow */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-mustard/20 rounded-full blur-[100px] -z-10 pointer-events-none"></div>
        
        <div className="mx-auto w-full max-w-4xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="display-heading text-5xl md:text-6xl lg:text-7xl font-bold text-ink mb-6">
              Ready to unlock <br className="hidden sm:block" /> your data?
            </h2>
            <p className="text-xl text-muted mb-12 max-w-2xl mx-auto">
              Upload your dataset and let our AI transform raw information into actionable intelligence in minutes.
            </p>
            
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
              <Link href="/upload" className="w-full sm:w-auto px-10 py-5 bg-ink text-cream rounded-full font-bold text-lg hover:bg-ink/90 shadow-2xl hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-2 group">
                Start Analysis <ArrowIcon className="transform group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/demo" className="w-full sm:w-auto px-10 py-5 bg-white text-ink border-2 border-ink/10 rounded-full font-bold text-lg hover:border-ink/30 transition-all duration-300 flex items-center justify-center">
                View Live Demo
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

    </div>
  );
}