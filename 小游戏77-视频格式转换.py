import os
import tkinter as tk
from tkinter import filedialog, messagebox
from tkinterdnd2 import DND_FILES, TkinterDnD
from moviepy.editor import VideoFileClip

def convert_video(input_path, output_format):
    try:
        video = VideoFileClip(input_path)
        file_name, _ = os.path.splitext(input_path)
        output_path = file_name + ('.mp4' if output_format == 'mp4' else '.mkv')
        video.write_videofile(output_path)
        video.close()
        messagebox.showinfo("Success", f"Video successfully converted to {output_format.upper()}")
    except Exception as e:
        messagebox.showerror("Error", f"An error occurred: {e}")

def on_drop(event):
    input_path.set(event.data)
    label_file.config(text=f"Selected file: {os.path.basename(event.data)}")

def browse_file():
    file_path = filedialog.askopenfilename(filetypes=[("Video files", "*.mkv *.mp4")])
    if file_path:
        input_path.set(file_path)
        label_file.config(text=f"Selected file: {os.path.basename(file_path)}")

def convert():
    if not input_path.get():
        messagebox.showwarning("Warning", "Please select a video file first.")
        return
    output_format = var_format.get()
    convert_video(input_path.get(), output_format)

app = TkinterDnD.Tk()
app.title("Video Converter")
app.geometry("400x200")

input_path = tk.StringVar()
var_format = tk.StringVar(value='mp4')

frame = tk.Frame(app)
frame.pack(pady=20)

label = tk.Label(frame, text="Drag and drop a video file here or click 'Browse'")
label.pack()

label_file = tk.Label(frame, text="No file selected")
label_file.pack()

frame_buttons = tk.Frame(app)
frame_buttons.pack(pady=20)

button_browse = tk.Button(frame_buttons, text="Browse", command=browse_file)
button_browse.grid(row=0, column=0, padx=10)

button_convert = tk.Button(frame_buttons, text="Convert", command=convert)
button_convert.grid(row=0, column=1, padx=10)

frame_format = tk.Frame(app)
frame_format.pack(pady=10)

label_format = tk.Label(frame_format, text="Output format:")
label_format.grid(row=0, column=0, padx=10)

radio_mp4 = tk.Radiobutton(frame_format, text="MP4", variable=var_format, value='mp4')
radio_mp4.grid(row=0, column=1)

radio_mkv = tk.Radiobutton(frame_format, text="MKV", variable=var_format, value='mkv')
radio_mkv.grid(row=0, column=2)

app.drop_target_register(DND_FILES)
app.dnd_bind('<<Drop>>', on_drop)

app.mainloop()
