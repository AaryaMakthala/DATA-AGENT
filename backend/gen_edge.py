"""Generate edge-case CSVs for a pipeline self-test. Writes to /tmp/edge."""
import os, io, struct
import numpy as np
import pandas as pd

OUT = "/tmp/edge"
os.makedirs(OUT, exist_ok=True)
np.random.seed(0)

def w(name, text=None, df=None, encoding="utf-8"):
    path = os.path.join(OUT, name)
    if df is not None:
        df.to_csv(path, index=False, encoding=encoding)
    else:
        with open(path, "w", encoding=encoding, newline="") as f:
            f.write(text)
    print(f"wrote {name} ({os.path.getsize(path)} bytes)")

# 1. Empty CSV (headers only, 0 rows)
w("01_headers_only.csv", "a,b,c\n")

# 2. Single row dataset
w("02_single_row.csv", df=pd.DataFrame({"age":[30],"income":[50000],"target":[1]}))

# 3. Only 1 column
w("03_one_column.csv", df=pd.DataFrame({"value":[1,2,3,4,5,6,7,8,9,10]}))

# 4. No plausible target (all identifiers / free text / high-cardinality)
w("04_no_target.csv", df=pd.DataFrame({
    "user_id":[f"u{i}" for i in range(40)],
    "email":[f"user{i}@x.com" for i in range(40)],
    "notes":[f"free text note number {i} unique" for i in range(40)],
}))

# 5. Every column all-null
w("05_all_null.csv", df=pd.DataFrame({"a":[np.nan]*20,"b":[np.nan]*20,"c":[np.nan]*20}))

# 6. Extreme class imbalance (1 positive in 100k)
n=100_000
y=np.zeros(n,dtype=int); y[0]=1
w("06_extreme_imbalance.csv", df=pd.DataFrame({
    "f1":np.random.randn(n),"f2":np.random.randn(n),"target":y}))

# 7. Duplicate column names
w("07_dup_columns.csv", "id,val,val\n1,2,3\n4,5,6\n7,8,9\n")

# 8. Non-UTF8 encoding + unicode in headers and values (latin-1)
df8=pd.DataFrame({"nom_café":["résumé","naïve","crème","élève"],
                  "prix":[1,2,3,4],"target":[0,1,0,1]})
w("08_latin1.csv", df=df8, encoding="latin-1")

# 9. Extremely wide (250 columns)
wide=pd.DataFrame({f"c{i}":np.random.randn(50) for i in range(249)})
wide["target"]=np.random.randint(0,2,50)
w("09_wide_250cols.csv", df=wide)

# 10. Large dataset (1.2M rows) - generated separately to watch memory/time
# (kept modest col count to keep file < ~60MB)
big=pd.DataFrame({"a":np.random.randn(1_200_000),
                  "b":np.random.randint(0,100,1_200_000),
                  "target":np.random.randint(0,2,1_200_000)})
w("10_large_1p2M.csv", df=big)

# 11. Mixed types within a single column
w("11_mixed_types.csv",
  "col,target\n1,0\ntwo,1\n3,0\nfour,1\n5,0\nsix,1\n7,0\n8,1\n9,0\nten,1\n")

# 12. .csv that isn't CSV (fake PNG binary)
png = os.path.join(OUT,"12_fake_image.csv")
with open(png,"wb") as f:
    f.write(b"\x89PNG\r\n\x1a\n"+struct.pack(">I",13)+b"IHDR"+os.urandom(200))
print(f"wrote 12_fake_image.csv ({os.path.getsize(png)} bytes)")

# 12b. JSON renamed to .csv
w("12b_json.csv", '{"a":1,"b":[1,2,3],"c":{"nested":true}}\n')

# 13. Malformed: unclosed quotes, ragged rows
w("13_malformed.csv",
  'name,city,val\n"alice,NYC,10\nbob,LA,20,extra\ncarol,30\n"dave,SF",40\n')

# 14. Extremely high-cardinality categorical (every value unique)
w("14_high_card.csv", df=pd.DataFrame({
    "unique_str":[f"val_{i}_{np.random.rand():.6f}" for i in range(500)],
    "num":np.random.randn(500),
    "target":np.random.randint(0,2,500)}))

# 15. Column literally named "target" but it's an identifier
w("15_target_is_id.csv", df=pd.DataFrame({
    "target":[f"REC{i:05d}" for i in range(60)],
    "f1":np.random.randn(60),
    "f2":np.random.randint(0,5,60)}))

print("DONE")
