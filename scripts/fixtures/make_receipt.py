#!/usr/bin/env python3
"""Best Buy receipt PNG fixture for ClaimIt S4 live-pipeline QA test.

Synthetic test fixture only. Single line item, paid $899 (above the live $699)
so the monitor detects an eligible drop.

NON-MEMBER (standard) purchase ON PURPOSE: the monitor compares a *member* buyer
against the page's memberPrice, which Best Buy may not expose -> comparison then
returns no-drop (comparison.py: member + price_member=None -> is_eligible=False,
no fallback). A non-member buyer compares against customerPrice ($699, always on
the page) -> the reliable path. So: no membership line, 15-day standard window.
"""

import random

from PIL import Image, ImageDraw, ImageFont

W = 760
MARGIN = 55
CONTENT_R = W - MARGIN
FG = "black"
DATE = "05/22/2026 14:35"

REG_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
BOLD_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
f_body = ImageFont.truetype(REG_FONT, 23)
f_bold = ImageFont.truetype(BOLD_FONT, 23)
f_logo = ImageFont.truetype(BOLD_FONT, 70)

img = Image.new("RGB", (W, 1500), "white")
d = ImageDraw.Draw(img)
y = 40
LH = 35


def center(text, font=f_body, gap=LH):
    global y
    d.text(((W - d.textlength(text, font=font)) / 2, y), text, font=font, fill=FG)
    y += gap


def left(text, font=f_body, gap=LH):
    global y
    d.text((MARGIN, y), text, font=font, fill=FG)
    y += gap


def lr(left_text, right_text, font=f_body, gap=LH):
    global y
    d.text((MARGIN, y), left_text, font=font, fill=FG)
    right_w = d.textlength(right_text, font=font)
    d.text((CONTENT_R - right_w, y), right_text, font=font, fill=FG)
    y += gap


def rule(char="-", font=f_body, gap=LH):
    global y
    count = int((CONTENT_R - MARGIN) / d.textlength(char, font=font))
    d.text((MARGIN, y), char * count, font=font, fill=FG)
    y += gap


for word in ("BEST", "BUY"):
    d.text(((W - d.textlength(word, font=f_logo)) / 2, y), word, font=f_logo, fill=FG)
    y += 72
y += 14

center("WELCOME TO BEST BUY #1407")
center("2701 W BIG BEAVER RD")
center("TROY, MI 48084")
center("(248) 816-1500")
y += 12

left("TRANS: 152784  REG: 120")
left(DATE)
rule("-")

lr('1 13" MACBOOK NEO A18 PRO', "$899.00")
left("  512GB SILVER (SKU: 6615875)")
rule("-")

lr("SUBTOTAL", "$899.00")
lr("TAX (6%)", "$53.94")
lr("TOTAL", "$952.94", font=f_bold)
lr("VISA ****4521", "952.94")
lr("APPROVED", "847291")
y += 12
rule("=")

center(DATE)
center("15-DAY RETURN WINDOW")
y += 12
center("FREE 2-DAY SHIPPING")
center("GEEK SQUAD TECH SUPPORT 24/7")
y += 12
center("KEEP YOUR RECEIPT!")
center("FOR RETURNS & WARRANTY SERVICE")
center("BestBuy.com/Returns")
y += 22

random.seed(57772193)
bar_h = 78
x = MARGIN + 40
bar_right = CONTENT_R - 40
while x < bar_right:
    bar_w = random.choice([2, 2, 3, 4, 5])
    if random.random() < 0.5:
        d.rectangle([x, y, x + bar_w, y + bar_h], fill=FG)
    x += bar_w + random.choice([2, 3, 4])
y += bar_h + 12
center("57772193")
y += 30

img = img.crop((0, 0, W, y))
OUT = "/mnt/user-data/outputs/bestbuy_macbook_pricedrop_receipt.png"
img.save(OUT, "PNG")
print("saved", OUT, img.size)
