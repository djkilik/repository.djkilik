"""할 일 관리 프로그램 (콘솔용)

할 일을 까먹거나 미루는 습관을 줄이기 위한 도구입니다.
- 마감일과 중요도를 함께 적어 두면 '지금 해야 할 일'부터 보여 줍니다.
- 마감이 지난 일, 오늘 마감인 일을 실행할 때마다 먼저 알려 줍니다.
- 할 일은 지우지 않고 '보관'만 합니다. 기록은 todo_data.json에 남습니다.

실행: python todo.py
표준 라이브러리만 사용하므로 따로 설치할 것이 없습니다.
"""

import json
import os
from datetime import date, datetime

DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "todo_data.json")
PRIORITY_NAMES = {1: "높음", 2: "보통", 3: "낮음"}


# ---------- 저장 / 불러오기 ----------

def load_tasks():
    """저장된 할 일을 불러옵니다. 파일이 없으면 빈 목록을 돌려줍니다."""
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        # 파일이 깨졌을 때 덮어쓰지 않도록 백업 이름으로 옮겨 둡니다.
        backup = DATA_FILE + ".broken"
        os.replace(DATA_FILE, backup)
        print(f"! 저장 파일을 읽을 수 없어 {backup} 으로 옮겨 두었습니다.")
        return []


def save_tasks(tasks):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(tasks, f, ensure_ascii=False, indent=2)


# ---------- 계산 도우미 ----------

def parse_date(text):
    """'2026-12-01', '12-01', '오늘', '내일' 형식을 날짜로 바꿉니다."""
    text = text.strip()
    if not text:
        return None
    today = date.today()
    if text == "오늘":
        return today
    if text == "내일":
        return date.fromordinal(today.toordinal() + 1)
    for fmt in ("%Y-%m-%d", "%m-%d"):
        try:
            d = datetime.strptime(text, fmt).date()
            if fmt == "%m-%d":
                d = d.replace(year=today.year)
            return d
        except ValueError:
            pass
    raise ValueError("날짜는 2026-12-01, 12-01, 오늘, 내일 중 하나로 적어 주세요.")


def days_left(task):
    if not task.get("due"):
        return None
    return (date.fromisoformat(task["due"]) - date.today()).days


def sort_key(task):
    """마감이 가까운 순 → 중요도 높은 순. 마감 없는 일은 뒤로."""
    left = days_left(task)
    return (left if left is not None else 10**6, task["priority"])


def due_label(task):
    left = days_left(task)
    if left is None:
        return "마감 없음"
    if left < 0:
        return f"{-left}일 지남!"
    if left == 0:
        return "오늘 마감!"
    if left == 1:
        return "내일 마감"
    return f"{left}일 남음"


def active(tasks):
    return [t for t in tasks if not t["done"] and not t.get("archived")]


# ---------- 화면 ----------

def show_alerts(tasks):
    """프로그램을 켤 때마다 급한 일을 먼저 보여 줍니다."""
    overdue = [t for t in active(tasks) if (days_left(t) or 0) < 0]
    today = [t for t in active(tasks) if days_left(t) == 0]
    if not overdue and not today:
        print("\n오늘 급한 일은 없어요. 여유 있을 때 미리 해 두세요 :)")
        return
    print("\n========== 먼저 확인하세요 ==========")
    for t in overdue:
        print(f"  [지남] {t['title']} ({due_label(t)})")
    for t in today:
        print(f"  [오늘] {t['title']}")
    print("=====================================")


def show_list(tasks, show_done=False):
    items = [t for t in tasks if not t.get("archived")]
    if not show_done:
        items = [t for t in items if not t["done"]]
    if not items:
        print("\n목록이 비어 있습니다.")
        return
    items.sort(key=lambda t: (t["done"], sort_key(t)))
    print(f"\n{'번호':>4}  {'상태':<4} {'중요도':<4} {'마감':<10} 할 일")
    print("-" * 50)
    for t in items:
        status = "완료" if t["done"] else "  "
        print(f"{t['id']:>4}  {status:<4} {PRIORITY_NAMES[t['priority']]:<4} "
              f"{due_label(t):<10} {t['title']}")


def show_next(tasks):
    """'지금 뭐 하지?'에 대한 답: 가장 먼저 할 일 하나만 보여 줍니다."""
    items = sorted(active(tasks), key=sort_key)
    if not items:
        print("\n남은 할 일이 없어요. 잘했어요!")
        return
    t = items[0]
    print(f"\n지금 할 일 → [{t['id']}] {t['title']}")
    print(f"   중요도 {PRIORITY_NAMES[t['priority']]}, {due_label(t)}")
    print("   팁: 딱 5분만 시작해 보세요. 시작이 제일 어렵습니다.")


# ---------- 기능 ----------

def add_task(tasks):
    title = input("할 일: ").strip()
    if not title:
        print("내용이 비어 있어 추가하지 않았습니다.")
        return
    while True:
        try:
            due = parse_date(input("마감일 (예: 12-01, 오늘, 내일 / 없으면 엔터): "))
            break
        except ValueError as e:
            print(e)
    p = input("중요도 1=높음 2=보통 3=낮음 (기본 2): ").strip()
    priority = int(p) if p in ("1", "2", "3") else 2
    new_id = max((t["id"] for t in tasks), default=0) + 1
    tasks.append({
        "id": new_id,
        "title": title,
        "due": due.isoformat() if due else None,
        "priority": priority,
        "done": False,
        "created": date.today().isoformat(),
        "done_at": None,
    })
    save_tasks(tasks)
    print(f"추가했습니다. (번호 {new_id})")


def find_task(tasks, prompt):
    text = input(prompt).strip()
    if not text.isdigit():
        print("번호를 숫자로 적어 주세요.")
        return None
    for t in tasks:
        if t["id"] == int(text) and not t.get("archived"):
            return t
    print("그 번호의 할 일이 없습니다.")
    return None


def complete_task(tasks):
    t = find_task(tasks, "완료한 할 일 번호: ")
    if t:
        t["done"] = True
        t["done_at"] = date.today().isoformat()
        save_tasks(tasks)
        left = len(active(tasks))
        print(f"'{t['title']}' 완료! 남은 일 {left}개.")


def archive_task(tasks):
    """삭제 대신 보관합니다. 데이터는 파일에 그대로 남습니다."""
    t = find_task(tasks, "목록에서 숨길(보관할) 번호: ")
    if t:
        t["archived"] = True
        save_tasks(tasks)
        print(f"'{t['title']}' 을(를) 보관했습니다. (기록은 남아 있습니다)")


def show_stats(tasks):
    done_today = [t for t in tasks if t.get("done_at") == date.today().isoformat()]
    total_done = [t for t in tasks if t["done"]]
    print(f"\n오늘 끝낸 일: {len(done_today)}개")
    print(f"지금까지 끝낸 일: {len(total_done)}개")
    print(f"남은 일: {len(active(tasks))}개")


MENU = """
---------------- 메뉴 ----------------
 1. 할 일 추가        2. 목록 보기
 3. 지금 할 일 하나   4. 완료 표시
 5. 완료 포함 전체    6. 보관(숨기기)
 7. 통계              0. 종료
--------------------------------------"""


def main():
    tasks = load_tasks()
    print("할 일 관리 프로그램")
    show_alerts(tasks)
    actions = {
        "1": add_task,
        "2": show_list,
        "3": show_next,
        "4": complete_task,
        "5": lambda ts: show_list(ts, show_done=True),
        "6": archive_task,
        "7": show_stats,
    }
    while True:
        print(MENU)
        choice = input("선택: ").strip()
        if choice == "0":
            print("저장했습니다. 오늘도 수고했어요!")
            break
        action = actions.get(choice)
        if action:
            action(tasks)
        else:
            print("메뉴 번호를 다시 골라 주세요.")


if __name__ == "__main__":
    main()
