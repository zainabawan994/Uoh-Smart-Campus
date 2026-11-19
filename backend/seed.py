"""Populate the database with sample University of Haripur data for testing.

Usage (from the backend folder):  python seed.py
Safe to re-run: existing users, menu items, timetables and posts are skipped.
All seeded accounts use development passwords. Change them before any real deployment.
"""
import asyncio
import os
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select

from app.auth import hash_password
from app.database import AsyncSessionLocal, close_db, init_db
from app.models import (
    AlertStatus, AlertType, CafeCategory, CafeMenuItem, CampusPost, EmergencyAlert,
    PostCategory, PostComment, PostLike, Timetable, User, UserRole,
)
from app.scraper import sync_events
from app.security import DEV_SEED_PASSWORDS

# Override with SEED_ADMIN_PASSWORD etc. to seed a real deployment without the public defaults.
PASSWORDS = {
    role: os.environ.get(f"SEED_{role.value.upper()}_PASSWORD", DEV_SEED_PASSWORDS[role.value])
    for role in (UserRole.student, UserRole.security, UserRole.cafe_manager, UserRole.admin)
}

# Approximate location of the University of Haripur main campus, Hattar Road.
CAMPUS_LAT, CAMPUS_LNG = 33.9946, 72.9106

# (reg_no, full_name, email, department, semester, section, role)
USERS = [
    ("A00-0001", "Dr. Imran Khan (Admin)", "admin@uoh.edu.pk", "Administration", 1, "A", UserRole.admin),
    ("S00-0001", "Muhammad Aslam (Security Chief)", "security@uoh.edu.pk", "Campus Security", 1, "A", UserRole.security),
    ("S00-0002", "Gul Nawaz (Security Guard)", "security2@uoh.edu.pk", "Campus Security", 1, "A", UserRole.security),
    ("C00-0001", "Shahid Mehmood (Cafe Manager)", "cafe@uoh.edu.pk", "Cafeteria", 1, "A", UserRole.cafe_manager),
    ("F23-0382", "Ali Hassan", "f23-0382@uoh.edu.pk", "Computer Science", 7, "A", UserRole.student),
    ("F23-0391", "Ayesha Siddiqui", "f23-0391@uoh.edu.pk", "Computer Science", 7, "A", UserRole.student),
    ("F23-0405", "Usman Tariq", "f23-0405@uoh.edu.pk", "Computer Science", 7, "B", UserRole.student),
    ("F23-0417", "Fatima Zahra", "f23-0417@uoh.edu.pk", "Computer Science", 7, "B", UserRole.student),
    ("F24-0112", "Hamza Abbasi", "f24-0112@uoh.edu.pk", "Software Engineering", 5, "A", UserRole.student),
    ("F24-0128", "Maryam Javed", "f24-0128@uoh.edu.pk", "Software Engineering", 5, "A", UserRole.student),
    ("F25-0045", "Bilal Ahmed", "f25-0045@uoh.edu.pk", "Forestry & Wildlife Management", 3, "A", UserRole.student),
    ("F25-0061", "Zainab Noor", "f25-0061@uoh.edu.pk", "Microbiology", 3, "A", UserRole.student),
    ("F25-0077", "Saad Khan Jadoon", "f25-0077@uoh.edu.pk", "Management Sciences", 3, "A", UserRole.student),
    ("F26-0009", "Hira Tanoli", "f26-0009@uoh.edu.pk", "English", 1, "A", UserRole.student),
]

# (item_name, category, price PKR, available)
CAFE_ITEMS = [
    ("Zinger Burger", CafeCategory.fast_food, 450, True),
    ("Chicken Shawarma", CafeCategory.fast_food, 250, True),
    ("Club Sandwich", CafeCategory.fast_food, 350, True),
    ("Chicken Pizza Slice", CafeCategory.fast_food, 300, False),
    ("Loaded Fries", CafeCategory.fast_food, 280, True),
    ("Chicken Biryani", CafeCategory.desi, 320, True),
    ("Daal Chawal", CafeCategory.desi, 180, True),
    ("Chicken Karahi (Half)", CafeCategory.desi, 650, True),
    ("Chana Pulao", CafeCategory.desi, 200, True),
    ("Aloo Paratha with Raita", CafeCategory.desi, 150, True),
    ("Chapli Kabab with Naan", CafeCategory.desi, 280, False),
    ("Samosa (2 pcs)", CafeCategory.snacks, 80, True),
    ("Pakora Plate", CafeCategory.snacks, 120, True),
    ("Chicken Roll", CafeCategory.snacks, 150, True),
    ("Fruit Chaat", CafeCategory.snacks, 150, True),
    ("Dahi Bhalay", CafeCategory.snacks, 130, False),
    ("Doodh Patti Chai", CafeCategory.beverages, 70, True),
    ("Green Tea (Kahwa)", CafeCategory.beverages, 60, True),
    ("Cold Drink (500ml)", CafeCategory.beverages, 120, True),
    ("Mineral Water (500ml)", CafeCategory.beverages, 60, True),
    ("Mango Shake", CafeCategory.beverages, 220, True),
    ("Lassi", CafeCategory.beverages, 150, True),
]

# Classes that get a Monday–Friday timetable: (department, semester, section) -> subjects.
# Each subject is (subject_name, teacher_name, room_no).
CLASS_SUBJECTS = {
    ("Computer Science", 7, "A"): [
        ("Artificial Intelligence", "Dr. Sajid Ali", "CS-101"),
        ("Compiler Construction", "Dr. Nadia Rehman", "CS-102"),
        ("Information Security", "Mr. Waqas Ahmed", "CS-Lab 2"),
        ("Software Project Management", "Ms. Sana Gul", "CS-103"),
        ("Final Year Project I", "Dr. Sajid Ali", "CS-Seminar Hall"),
    ],
    ("Computer Science", 7, "B"): [
        ("Artificial Intelligence", "Dr. Sajid Ali", "CS-104"),
        ("Compiler Construction", "Mr. Adnan Shah", "CS-105"),
        ("Information Security", "Mr. Waqas Ahmed", "CS-Lab 3"),
        ("Software Project Management", "Ms. Sana Gul", "CS-104"),
        ("Final Year Project I", "Dr. Nadia Rehman", "CS-Seminar Hall"),
    ],
    ("Software Engineering", 5, "A"): [
        ("Software Design & Architecture", "Dr. Kashif Naseer", "SE-201"),
        ("Web Engineering", "Mr. Faisal Mehmood", "SE-Lab 1"),
        ("Database Systems", "Ms. Rabia Khan", "SE-202"),
        ("Operating Systems", "Mr. Junaid Iqbal", "SE-203"),
        ("Technical Writing", "Ms. Amna Shah", "SE-201"),
    ],
    ("Forestry & Wildlife Management", 3, "A"): [
        ("Forest Ecology", "Dr. Shah Faisal", "FW-11"),
        ("Dendrology", "Dr. Iftikhar Ahmad", "FW-12"),
        ("Wildlife Biology", "Dr. Saeed Gul", "FW-Lab"),
        ("Soil Science", "Ms. Uzma Bibi", "FW-11"),
    ],
    ("Microbiology", 3, "A"): [
        ("General Microbiology", "Dr. Sadia Alam", "MB-01"),
        ("Biochemistry", "Dr. Tariq Mahmood", "MB-02"),
        ("Microbial Genetics", "Dr. Sadia Alam", "MB-Lab"),
        ("Biostatistics", "Mr. Kamran Ali", "MB-01"),
    ],
    ("Management Sciences", 3, "A"): [
        ("Principles of Marketing", "Mr. Noman Khan", "MS-07"),
        ("Financial Accounting", "Ms. Saima Iqbal", "MS-08"),
        ("Business Communication", "Ms. Hina Shah", "MS-07"),
        ("Microeconomics", "Dr. Zahid Hussain", "MS-09"),
    ],
    ("English", 1, "A"): [
        ("Introduction to Linguistics", "Dr. Farah Naz", "EN-03"),
        ("Functional English", "Ms. Asma Khan", "EN-04"),
        ("Introduction to Literature", "Dr. Farah Naz", "EN-03"),
        ("Islamic Studies", "Dr. Abdul Wahab", "EN-05"),
    ],
}

TIME_SLOTS = [
    (time(8, 30), time(10, 0)),
    (time(10, 0), time(11, 30)),
    (time(11, 30), time(13, 0)),
    (time(14, 0), time(15, 30)),
]
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
CLASSES_PER_DAY = 3

# (author reg_no, title, content, category, commenters with text, liked_by reg_nos)
POSTS = [
    ("A00-0001", "Mid-Term Examination Schedule",
     "Mid-term examinations for all BS programs start next Monday. Date sheets are posted on department notice boards. "
     "Bring your university ID card to every paper.",
     PostCategory.announcement,
     [("F23-0382", "Will the date sheet also be shared on the portal?"),
      ("A00-0001", "Yes, departments will upload it by Friday.")],
     ["F23-0382", "F23-0391", "F24-0112", "F25-0045"]),
    ("F23-0391", "Lost: Black HP laptop bag",
     "I left a black HP laptop bag in the CS Block library around 2 PM yesterday. It has my charger and notes inside. "
     "Please contact me if you found it.",
     PostCategory.lost_and_found,
     [("F23-0405", "Check with the library front desk, they keep lost items."),
      ("F23-0391", "Thanks! I'll ask there.")],
     ["F23-0382", "F23-0417"]),
    ("F25-0061", "Found: Student ID card near the cafeteria",
     "Found a student ID card (Software Engineering department) near the main cafeteria. Handed it to the security office.",
     PostCategory.lost_and_found,
     [("F24-0128", "That might be mine! Going to the security office now.")],
     ["F24-0128", "F24-0112"]),
    ("F24-0112", "Need help with normalization (3NF / BCNF)",
     "Can someone explain the difference between 3NF and BCNF with a simple example? Our Database Systems quiz is on Thursday.",
     PostCategory.study_help,
     [("F23-0382", "BCNF is stricter: every determinant must be a candidate key. 3NF allows a non-key determinant "
                   "if the dependent attribute is part of a key."),
      ("F24-0112", "That makes sense now, thank you!")],
     ["F24-0128", "F23-0391", "F23-0382"]),
    ("F23-0417", "AI study group this weekend",
     "Starting a study group for Artificial Intelligence (search algorithms and CSPs). Saturday 11 AM in CS-Seminar Hall. "
     "Everyone from 7A and 7B is welcome.",
     PostCategory.study_help,
     [("F23-0405", "Count me in."), ("F23-0391", "I'll bring past papers.")],
     ["F23-0382", "F23-0405", "F23-0391"]),
    ("F26-0009", "Beautiful evening at the campus lawn",
     "The weather in Haripur is perfect today. Anyone up for chai at the cafeteria after the last class?",
     PostCategory.general,
     [("F25-0077", "Doodh patti at 4 PM!")],
     ["F25-0077", "F25-0061"]),
]


async def seed_users(db) -> dict[str, User]:
    existing = {u.reg_no: u for u in (await db.execute(select(User))).scalars().all()}
    hashes = {role: hash_password(pw) for role, pw in PASSWORDS.items()}
    created = 0
    for reg_no, name, email, dept, sem, section, role in USERS:
        if reg_no in existing:
            continue
        user = User(reg_no=reg_no, full_name=name, email=email, department=dept,
                    semester=sem, section=section, role=role, password_hash=hashes[role])
        db.add(user)
        existing[reg_no] = user
        created += 1
    await db.flush()
    print(f"Users: {created} created, {len(USERS) - created} already existed")
    return existing


async def seed_cafe(db) -> None:
    names = set((await db.execute(select(CafeMenuItem.item_name))).scalars().all())
    new = [CafeMenuItem(item_name=n, category=c, price=Decimal(p), is_available=a)
           for n, c, p, a in CAFE_ITEMS if n not in names]
    db.add_all(new)
    print(f"Cafe menu: {len(new)} items created, {len(CAFE_ITEMS) - len(new)} already existed")


async def seed_timetable(db) -> None:
    created = 0
    for (dept, sem, section), subjects in CLASS_SUBJECTS.items():
        has_rows = await db.scalar(
            select(func.count()).select_from(Timetable).where(
                Timetable.department == dept, Timetable.semester == sem, Timetable.section == section)
        )
        if has_rows:
            continue
        # Rotate through the subjects so each day gets a different mix.
        for day_index, day in enumerate(WEEKDAYS):
            for slot_index in range(CLASSES_PER_DAY):
                subject, teacher, room = subjects[(day_index + slot_index) % len(subjects)]
                start, end = TIME_SLOTS[slot_index if day_index % 2 == 0 else slot_index + 1]
                db.add(Timetable(department=dept, semester=sem, section=section, day_of_week=day,
                                 subject_name=subject, teacher_name=teacher, room_no=room,
                                 start_time=start, end_time=end))
                created += 1
    print(f"Timetable: {created} entries created")


async def seed_posts(db, users: dict[str, User]) -> None:
    if await db.scalar(select(func.count()).select_from(CampusPost)):
        print("Posts: skipped (posts already exist)")
        return
    now = datetime.now(timezone.utc)
    for i, (author, title, content, category, comments, likers) in enumerate(POSTS):
        post = CampusPost(user_id=users[author].id, title=title, content=content, category=category,
                          likes_count=len(likers), created_at=now - timedelta(hours=3 * (len(POSTS) - i)))
        db.add(post)
        await db.flush()
        first_comment_id = None
        for j, (commenter, text) in enumerate(comments):
            comment = PostComment(post_id=post.id, user_id=users[commenter].id, comment_text=text,
                                  parent_id=first_comment_id,  # later comments reply to the first one
                                  created_at=post.created_at + timedelta(minutes=10 * (j + 1)))
            db.add(comment)
            await db.flush()
            if first_comment_id is None:
                first_comment_id = comment.id
        db.add_all(PostLike(post_id=post.id, user_id=users[r].id) for r in likers)
    print(f"Posts: {len(POSTS)} created with comments and likes")


async def seed_alerts(db, users: dict[str, User]) -> None:
    if await db.scalar(select(func.count()).select_from(EmergencyAlert)):
        print("Emergency alerts: skipped (alerts already exist)")
        return
    now = datetime.now(timezone.utc)
    samples = [
        ("F23-0405", AlertType.medical, 0.0008, -0.0006, "SAMPLE: CS Block, 2nd floor – student fainted",
         AlertStatus.resolved, timedelta(days=2)),
        ("F25-0061", AlertType.harassment, -0.0011, 0.0009, "SAMPLE: Near girls' hostel gate",
         AlertStatus.resolved, timedelta(days=1)),
        ("F24-0112", AlertType.fire, 0.0004, 0.0012, "SAMPLE: Smoke from SE-Lab 1",
         AlertStatus.dispatched, timedelta(minutes=25)),
    ]
    for reg_no, kind, dlat, dlng, note, status, ago in samples:
        created = now - ago
        db.add(EmergencyAlert(
            user_id=users[reg_no].id, alert_type=kind,
            latitude=CAMPUS_LAT + dlat, longitude=CAMPUS_LNG + dlng, location_note=note, status=status,
            created_at=created,
            resolved_at=created + timedelta(minutes=18) if status == AlertStatus.resolved else None,
        ))
    print(f"Emergency alerts: {len(samples)} sample alerts created")


async def main() -> None:
    await init_db()
    async with AsyncSessionLocal() as db:
        users = await seed_users(db)
        await seed_cafe(db)
        await seed_timetable(db)
        await seed_posts(db, users)
        await seed_alerts(db, users)
        await db.commit()

    print("Events: syncing from uoh.edu.pk (uses sample events if the site is unreachable)...")
    async with AsyncSessionLocal() as db:
        result = await sync_events(db)
    print(f"Events: {result['inserted']} new of {result['fetched']} fetched (source: {result['source']})")
    await close_db()

    print("\nLogin with registration ID or email:")
    for reg_no, name, _, dept, sem, section, role in USERS:
        print(f"  {role.value:<13} {reg_no}  {PASSWORDS[role]:<13} {name} ({dept}, sem {sem}{section})")


if __name__ == "__main__":
    asyncio.run(main())
